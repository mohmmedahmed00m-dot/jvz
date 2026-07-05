import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from '../../../database/entities';
import { AssetType, GeneratorContext } from '../generators.types';
import { buildPrompt, interpolate, PROMPT_TEMPLATES } from './prompt-templates';
import { mockGenerate } from './mock-generator';
import { LlmClientService } from './llm-client.service';

/**
 * The AI Engine (Section 1.1 / 3.0): Prompt Builder + LLM dispatch +
 * response parsing hook. Orchestrates: select template → interpolate inputs →
 * call provider (or deterministic mock) → return raw content string for the
 * generator-specific validator/sanitizer to process.
 */
@Injectable()
export class AiEngineService {
  private readonly logger = new Logger('AiEngine');

  constructor(
    private readonly llm: LlmClientService,
    private readonly config: ConfigService,
    @InjectRepository(Template) private readonly templateRepo: Repository<Template>,
  ) {}

  /**
   * Runs one generation pass for a single asset type.
   * Returns the raw content string (HTML or JSON-as-text).
   * The caller is responsible for validation + sanitization.
   */
  async runGeneration(
    assetType: AssetType,
    ctx: GeneratorContext,
    customInstruction?: string,
  ): Promise<{ content: string; usedMock: boolean }> {
    const tpl = await this.getActiveTemplate(assetType);
    const { system, user } = this.buildFromTemplate(assetType, ctx, tpl, customInstruction);

    const useReal = this.config.get<boolean>('AI_USE_REAL_LLM');
    if (useReal) {
      try {
        const content = await this.llm.complete(system, user);
        const cleaned = this.stripFences(content);
        return { content: cleaned, usedMock: false };
      } catch (err) {
        // In production we must NOT silently degrade to mock output — the user
        // would receive mock content believing it was AI-generated. Surface the
        // failure so the generator's retry/fallback path + error logging apply.
        this.logger.error(
          `Real LLM call failed for ${assetType}: ${(err as Error).message}. Propagating (no silent mock fallback in production).`,
        );
        throw err;
      }
    }
    return { content: mockGenerate(assetType, ctx), usedMock: true };
  }

  private async getActiveTemplate(assetType: AssetType): Promise<Template | null> {
    return this.templateRepo.findOne({ where: { asset_type: assetType, is_active: true } });
  }

  private buildFromTemplate(
    assetType: AssetType,
    ctx: GeneratorContext,
    tpl: Template | null,
    customInstruction?: string,
  ) {
    if (tpl && tpl.prompt_template) {
      // Stored template: split on a delimiter or treat the whole text as user.
      // We store "system ||| user" in the seed; if no delimiter, treat as user.
      const [systemRaw, userRaw] = tpl.prompt_template.includes('|||')
        ? tpl.prompt_template.split('|||', 2)
        : [PROMPT_TEMPLATES[assetType].system, tpl.prompt_template];
      const user = interpolate(userRaw, ctx) + (customInstruction ? `\n\nAdditional instruction: ${customInstruction}` : '');
      return { system: systemRaw.trim(), user };
    }
    return buildPrompt(assetType, ctx, customInstruction);
  }

  private stripFences(content: string): string {
    const trimmed = content.trim();
    const fence = /^```(json|html)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    return fence ? fence[2] : trimmed;
  }
}
