import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Campaign, GeneratedAsset } from '../../database/entities';
import { GeneratorsService } from '../generators/generators.service';
import { sanitizeReviewBonusHtml } from '../generators/ai-engine/html-sanitizer';
import { GeneratorContext, AssetType } from '../generators/generators.types';
import { CreateCampaignDto, ListCampaignsQuery } from './dto';
import { EncryptionService } from '../../common/crypto/encryption.service';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger('Campaigns');

  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(GeneratedAsset) private readonly assetRepo: Repository<GeneratedAsset>,
    private readonly generators: GeneratorsService,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
  ) {}

  async create(userId: string, dto: CreateCampaignDto) {
    // Section 1.3 wants consistency between Campaign + Assets, but Section 3.0/5
    // also allows generation to be a long-running step (async/queue). Holding a
    // DB transaction open across 5 sequential LLM network calls would exhaust
    // the connection pool under load. Resolution: create the campaign row in a
    // SHORT transaction, run generation OUTSIDE any transaction, then set the
    // final status. If generation fails mid-way, the campaign keeps whatever
    // assets succeeded (idempotent regenerate can resume per Section 3.0 step 7).
    const campaign = await this.dataSource.transaction(async (mgr) => {
      const c = mgr.create(Campaign, {
        user_id: userId,
        product_name: dto.product_name,
        product_url: dto.product_url ?? null,
        niche: dto.niche ?? null,
        tone: dto.tone,
        target_audience: dto.target_audience ?? null,
        status: 'generating',
      });
      return mgr.save(c);
    });

    const ctx: GeneratorContext = {
      product_name: dto.product_name,
      product_url: dto.product_url,
      niche: dto.niche,
      tone: dto.tone,
      target_audience: dto.target_audience,
    };
    const selected = (dto.generators_selected?.length ? dto.generators_selected : undefined) as
      | AssetType[]
      | undefined;

    // Generation runs OUTSIDE the transaction (network I/O to the LLM).
    const outcomes = await this.generators.generateForCampaign(campaign.id, selected ?? [], ctx);
    const failed = outcomes.filter((o) => !o.ok);

    campaign.status = failed.length === outcomes.length ? 'failed' : 'generated';
    await this.campaignRepo.save(campaign);

    if (failed.length === outcomes.length) {
      throw new BadRequestException({
        code: 'GENERATION_FAILED',
        message: 'All generators failed; please retry',
        outcomes,
      });
    }

    return { campaign_id: campaign.id, status: 'generating' };
  }

  async list(userId: string, query: ListCampaignsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.campaignRepo.createQueryBuilder('c').where('c.user_id = :userId', { userId });
    if (query.search) qb.andWhere('c.product_name ILIKE :s', { s: `%${query.search}%` });
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.date_from) qb.andWhere('c.created_at >= :df', { df: query.date_from });
    if (query.date_to) qb.andWhere('c.created_at <= :dt', { dt: query.date_to });
    qb.orderBy('c.created_at', 'DESC').skip((page - 1) * limit).take(limit);

    const [campaigns, total] = await qb.getManyAndCount();
    return { campaigns, total, page };
  }

  async getOne(userId: string, id: string): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });
    if (campaign.user_id !== userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your campaign' });
    return campaign;
  }

  async getAssets(userId: string, campaignId: string) {
    await this.getOne(userId, campaignId);
    const assets = await this.assetRepo.find({ where: { campaign_id: campaignId } });
    const map: Record<string, GeneratedAsset | null> = {
      review: null,
      bonus: null,
      email_sequence: null,
      social_posts: null,
      cta: null,
    };
    for (const a of assets) {
      // Decrypt content from AES-256-GCM at rest
      if (a.content) {
        a.content = this.encryption.decrypt(a.content);
      }
      map[a.asset_type] = a;
    }
    return { assets: map };
  }

  async updateAsset(userId: string, campaignId: string, assetType: string, content: string) {
    await this.getOne(userId, campaignId);
    const existing = await this.assetRepo.findOne({ where: { campaign_id: campaignId, asset_type: assetType } });
    if (!existing) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Asset not found' });

    // audit fix #5: HTML assets (review/bonus) must be sanitized even on manual
    // edit, so a user pasting <script>/<iframe> cannot store or export raw XSS.
    // JSON/text assets are validated structurally.
    const safe = existing.content_format === 'html' ? sanitizeReviewBonusHtml(content).trim() : content;
    if (existing.content_format === 'json') {
      try { JSON.parse(content); } catch {
        throw new BadRequestException({ code: 'INVALID_JSON', message: 'Asset content is not valid JSON' });
      }
    }

    // Encrypt content before storing (AES-256-GCM at rest)
    existing.content = this.encryption.encrypt(safe);
    existing.is_manual_edit = true;
    existing.version = existing.version + 1;
    const saved = await this.assetRepo.save(existing);
    // Return decrypted content in the response
    const decrypted = { ...saved, content: this.encryption.decrypt(saved.content) };
    return { asset: decrypted, version: saved.version, is_manual_edit: true };
  }

  async regenerate(
    userId: string,
    campaignId: string,
    assetType: string,
    customInstruction: string | undefined,
  ) {
    const campaign = await this.getOne(userId, campaignId);
    const ctx: GeneratorContext = {
      product_name: campaign.product_name,
      product_url: campaign.product_url ?? undefined,
      niche: campaign.niche ?? undefined,
      tone: campaign.tone,
      target_audience: campaign.target_audience ?? undefined,
    };
    const asset = await this.generators.generateAsset(campaignId, assetType as AssetType, ctx, customInstruction);
    return { asset, version: asset.version };
  }

  async duplicate(userId: string, campaignId: string) {
    const original = await this.getOne(userId, campaignId);
    const copy = this.campaignRepo.create({
      user_id: userId,
      product_name: original.product_name,
      product_url: original.product_url,
      niche: original.niche,
      tone: original.tone,
      target_audience: original.target_audience,
      status: 'draft',
    });
    await this.campaignRepo.save(copy);
    return { new_campaign_id: copy.id };
  }

  async remove(userId: string, campaignId: string) {
    const campaign = await this.getOne(userId, campaignId);
    await this.campaignRepo.remove(campaign); // cascades to assets + exports
    return;
  }

  async setStatus(campaignId: string, status: string) {
    await this.campaignRepo.update(campaignId, { status });
  }
}
