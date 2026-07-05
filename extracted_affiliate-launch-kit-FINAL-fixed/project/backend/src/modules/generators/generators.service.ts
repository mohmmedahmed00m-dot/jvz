import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { GeneratedAsset } from '../../database/entities';
import { AiEngineService } from './ai-engine/ai-engine.service';
import { mockGenerate } from './ai-engine/mock-generator';
import { STRATEGIES } from './strategies';
import { AssetType, GeneratorContext, ALL_ASSET_TYPES } from './generators.types';
import { EncryptionService } from '../../common/crypto/encryption.service';

export interface GenerateOutcome {
  asset_type: AssetType;
  ok: boolean;
  version: number;
  error?: string;
}

/**
 * Orchestrates the common processing pattern (Section 3.0) for all 5 generators:
 *  1. apply defaults    2. run AI engine    3. validate schema
 *  4. single retry w/ stricter instruction   5. finalize (sanitize/normalize)
 *  6. persist (version increments on regenerate).
 *
 * `manager` may be passed to execute persistence inside an outer transaction
 * (audit fix #4: a Campaign and all its GeneratedAssets commit atomically).
 */
@Injectable()
export class GeneratorsService {
  private readonly logger = new Logger('Generators');

  constructor(
    @InjectRepository(GeneratedAsset) private readonly assetRepo: Repository<GeneratedAsset>,
    private readonly aiEngine: AiEngineService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Generate a single asset for a campaign (used by initial run + regenerate). */
  async generateAsset(
    campaignId: string,
    assetType: AssetType,
    ctx: GeneratorContext,
    customInstruction?: string,
    manager?: EntityManager,
  ): Promise<GeneratedAsset> {
    const strategy = STRATEGIES[assetType];
    if (!strategy) throw new BadRequestException({ code: 'UNKNOWN_ASSET_TYPE', message: `Unknown asset type ${assetType}` });

    const enrichedCtx = strategy.applyDefaults(ctx);
    const outcome = await this.runWithValidation(assetType, enrichedCtx, customInstruction, strategy);
    // Encrypt content before persisting (AES-256-GCM at rest)
    const encryptedContent = this.encryption.encrypt(outcome.content);
    return this.persistAsset(campaignId, assetType, encryptedContent, strategy.format, manager);
  }

  /** Run all selected generators for a campaign (used by POST /campaigns). */
  async generateForCampaign(
    campaignId: string,
    selected: AssetType[],
    ctx: GeneratorContext,
    manager?: EntityManager,
  ): Promise<GenerateOutcome[]> {
    const types = selected && selected.length ? selected : [...ALL_ASSET_TYPES];
    const outcomes: GenerateOutcome[] = [];
    for (const assetType of types) {
      try {
        const asset = await this.generateAsset(campaignId, assetType, ctx, undefined, manager);
        outcomes.push({ asset_type: assetType, ok: true, version: asset.version });
      } catch (err) {
        this.logger.error(`Generation failed for ${assetType}: ${(err as Error).message}`);
        outcomes.push({ asset_type: assetType, ok: false, version: 0, error: (err as Error).message });
      }
    }
    return outcomes;
  }

  private async runWithValidation(
    assetType: AssetType,
    ctx: GeneratorContext,
    customInstruction: string | undefined,
    strategy: (typeof STRATEGIES)[AssetType],
  ): Promise<{ content: string }> {
    const { content: raw1 } = await this.aiEngine.runGeneration(assetType, ctx, customInstruction);
    if (strategy.validate(raw1, ctx)) {
      return { content: strategy.finalize(raw1) };
    }
    this.logger.warn(`First-pass validation failed for ${assetType}; retrying once with stricter instruction.`);
    const stricter = (customInstruction ? customInstruction + ' ' : '') + strategy.retryInstruction(ctx);
    const { content: raw2 } = await this.aiEngine.runGeneration(assetType, ctx, stricter);
    if (strategy.validate(raw2, ctx)) {
      return { content: strategy.finalize(raw2) };
    }
    this.logger.warn(`Retry still invalid for ${assetType}; using deterministic fallback.`);
    const fallback = mockGenerate(assetType, ctx);
    return { content: strategy.finalize(fallback) };
  }

  private async persistAsset(
    campaignId: string,
    assetType: AssetType,
    content: string,
    format: string,
    manager?: EntityManager,
  ): Promise<GeneratedAsset> {
    const repo = manager ? manager.getRepository(GeneratedAsset) : this.assetRepo;
    const existing = await repo.findOne({ where: { campaign_id: campaignId, asset_type: assetType } });
    if (existing) {
      existing.content = content;
      existing.version = existing.version + 1;
      existing.is_manual_edit = false;
      return repo.save(existing);
    }
    const asset = repo.create({
      campaign_id: campaignId,
      asset_type: assetType,
      content_format: format,
      content,
      version: 1,
      is_manual_edit: false,
    });
    return repo.save(asset);
  }
}
