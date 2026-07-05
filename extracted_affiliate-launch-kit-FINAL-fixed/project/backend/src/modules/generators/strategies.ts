import { isWellFormedHtml, sanitizeReviewBonusHtml } from './ai-engine/html-sanitizer';
import { AssetType, ContentFormat, GeneratorContext, ASSET_FORMAT } from './generators.types';

/**
 * Per-generator validation + post-processing (Section 3.0 steps 4–5).
 * Each strategy knows how to validate its output schema and finalize content.
 */
export interface GeneratorStrategy {
  assetType: AssetType;
  format: ContentFormat;
  /** Apply Section 3 defaults to the context before generation. */
  applyDefaults(ctx: GeneratorContext): GeneratorContext;
  /** Returns true when content satisfies the schema. */
  validate(content: string, ctx: GeneratorContext): boolean;
  /** Finalize: sanitize HTML / normalize JSON before persisting. */
  finalize(content: string): string;
  /** A stricter instruction appended on the single retry (Section 3.0 step 4). */
  retryInstruction(ctx?: GeneratorContext): string;
}

function countBonusCards(html: string): number {
  return (html.match(/<div class="bonus-card">/gi) || []).length;
}

export const REVIEW_STRATEGY: GeneratorStrategy = {
  assetType: 'review',
  format: ASSET_FORMAT.review,
  applyDefaults: (ctx) => ctx,
  validate: (c) => isWellFormedHtml(c) && /<h1/i.test(c) && /<ul/i.test(c),
  finalize: (c) => sanitizeReviewBonusHtml(c).trim(),
  retryInstruction: () => 'Return ONLY well-formed semantic HTML with matching open/close tags, no markdown fences, no extra text.',
};

export const BONUS_STRATEGY: GeneratorStrategy = {
  assetType: 'bonus',
  format: ASSET_FORMAT.bonus,
  applyDefaults: (ctx) => ({ ...ctx, bonus_count: ctx.bonus_count ?? 3 }),
  validate: (c, ctx) => isWellFormedHtml(c) && countBonusCards(c) === (ctx.bonus_count ?? 3),
  finalize: (c) => sanitizeReviewBonusHtml(c).trim(),
  retryInstruction: (ctx) => `You MUST output EXACTLY ${ctx?.bonus_count ?? 3} bonus items, each wrapped in <div class="bonus-card">. Count must match.`,
};

export const EMAIL_STRATEGY: GeneratorStrategy = {
  assetType: 'email_sequence',
  format: ASSET_FORMAT.email_sequence,
  applyDefaults: (ctx) => ({ ...ctx, email_count: ctx.email_count ?? 5 }),
  validate: (c, ctx) => {
    try {
      const arr = JSON.parse(c);
      if (!Array.isArray(arr)) return false;
      const want = ctx.email_count ?? 5;
      if (arr.length !== want) return false;
      return arr.every(
        (e: any) =>
          typeof e === 'object' && e !== null &&
          'order' in e && 'subject' in e && 'preheader' in e && 'body' in e && 'cta_text' in e,
      );
    } catch {
      return false;
    }
  },
  finalize: (c) => JSON.stringify(JSON.parse(c), null, 2),
  retryInstruction: () => 'Return ONLY a valid JSON array. No markdown fences, no surrounding text. Each item: { order, subject, preheader, body, cta_text }.',
};

export const SOCIAL_STRATEGY: GeneratorStrategy = {
  assetType: 'social_posts',
  format: ASSET_FORMAT.social_posts,
  applyDefaults: (ctx) => ({
    ...ctx,
    platforms: ctx.platforms && ctx.platforms.length ? ctx.platforms : ['facebook', 'twitter', 'instagram', 'linkedin'],
  }),
  validate: (c, ctx) => {
    try {
      const obj = JSON.parse(c);
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
      const platforms = ctx.platforms && ctx.platforms.length ? ctx.platforms : ['facebook', 'twitter', 'instagram', 'linkedin'];
      for (const p of platforms) {
        if (!(p in obj)) return false;
      }
      if (obj.twitter && typeof obj.twitter.text === 'string' && obj.twitter.text.length > 280) return false;
      return true;
    } catch {
      return false;
    }
  },
  finalize: (c) => JSON.stringify(JSON.parse(c), null, 2),
  retryInstruction: () => 'Return ONLY a valid JSON object keyed by platform. twitter.text <= 280 chars. No markdown fences.',
};

export const CTA_STRATEGY: GeneratorStrategy = {
  assetType: 'cta',
  format: ASSET_FORMAT.cta,
  applyDefaults: (ctx) => ({ ...ctx, cta_count: ctx.cta_count ?? 5 }),
  validate: (c, ctx) => {
    try {
      const arr = JSON.parse(c);
      if (!Array.isArray(arr)) return false;
      const want = ctx.cta_count ?? 5;
      if (arr.length !== want) return false;
      return arr.every(
        (e: any) =>
          typeof e === 'object' && e !== null &&
          'button_text' in e && 'supporting_line' in e &&
          'urgency_level' in e && ['Low', 'Medium', 'High'].includes(e.urgency_level) &&
          'placement_context' in e,
      );
    } catch {
      return false;
    }
  },
  finalize: (c) => JSON.stringify(JSON.parse(c), null, 2),
  retryInstruction: (ctx) => `Return ONLY a valid JSON array of EXACTLY ${ctx?.cta_count ?? 5} objects with: button_text, supporting_line, urgency_level (Low|Medium|High), placement_context.`,
};

export const STRATEGIES: Record<AssetType, GeneratorStrategy> = {
  review: REVIEW_STRATEGY,
  bonus: BONUS_STRATEGY,
  email_sequence: EMAIL_STRATEGY,
  social_posts: SOCIAL_STRATEGY,
  cta: CTA_STRATEGY,
};
