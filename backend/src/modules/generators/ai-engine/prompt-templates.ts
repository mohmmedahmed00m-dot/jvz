import { AssetType, GeneratorContext } from '../generators.types';

/**
 * Prompt skeletons — taken verbatim from Section 3.1–3.5 of the blueprint.
 * These are also seeded into the Templates table (one active per asset_type);
 * if a template is missing the engine falls back to these constants.
 */

function ctxVals(ctx: GeneratorContext) {
  return {
    '{{product_name}}': ctx.product_name,
    '{{product_url}}': ctx.product_url || '',
    '{{niche}}': ctx.niche || 'Make Money Online',
    '{{tone}}': ctx.tone || 'professional',
    '{{target_audience}}': ctx.target_audience || 'marketers',
    '{{bonus_count}}': String(ctx.bonus_count ?? 3),
    '{{email_count}}': String(ctx.email_count ?? 5),
    '{{selected_platforms}}': (ctx.platforms && ctx.platforms.length
      ? ctx.platforms
      : ['facebook', 'twitter', 'instagram', 'linkedin']
    ).join(', '),
    '{{cta_count}}': String(ctx.cta_count ?? 5),
    '{{placement_context}}': ctx.placement_context || 'Review Page Button',
    '{{cta_link_placeholder}}': ctx.product_url || '#cta-link',
  };
}

export function interpolate(template: string, ctx: GeneratorContext): string {
  const vals = ctxVals(ctx);
  let out = template;
  for (const [k, v] of Object.entries(vals)) {
    out = out.split(k).join(v);
  }
  return out;
}

// Each entry: [systemPrompt, userPromptSkeleton]
export const PROMPT_TEMPLATES: Record<AssetType, { system: string; user: string }> = {
  review: {
    system:
      'You are an affiliate marketing copywriter. Output ONLY valid semantic HTML. No explanations, no markdown fences.',
    user: `Product: {{product_name}}
Niche: {{niche}}
Tone: {{tone}}
Audience: {{target_audience}}

Generate a complete affiliate review page with these HTML sections in order:
1. <h1> Headline
2. Intro hook paragraph
3. <ul> Pros (5-7 items)
4. <ul> Cons (2-4 items)
5. Feature breakdown (3-5 <h3> subsections with <p>)
6. Verdict paragraph
7. <div class="cta-block"> with a closing call-to-action sentence and a placeholder button: <a href="{{cta_link_placeholder}}" class="cta-button">BUTTON_TEXT</a>

Return ONLY the HTML, no surrounding text.`,
  },
  bonus: {
    system:
      'You are a bonus-page copywriter for affiliate marketers. Output ONLY valid semantic HTML.',
    user: `Product: {{product_name}}
Niche: {{niche}}
Tone: {{tone}}
Number of bonuses: {{bonus_count}}

Generate a bonus page with:
1. <h1> headline announcing exclusive bonuses
2. Exactly {{bonus_count}} bonus items, each wrapped in <div class="bonus-card"> containing <h3> title, <p> description, <span class="value-tag"> estimated value
3. Closing <div class="cta-block"> with urgency copy and a placeholder button

Return ONLY the HTML.`,
  },
  email_sequence: {
    system:
      'You are an email marketing copywriter for affiliate launches. Output ONLY valid JSON, no markdown fences, no explanations.',
    user: `Product: {{product_name}}
Niche: {{niche}}
Tone: {{tone}}
Audience: {{target_audience}}
Number of emails: {{email_count}}

Generate a JSON array of {{email_count}} email objects with this exact schema per item:
{ "order": number, "subject": string, "preheader": string, "body": string, "cta_text": string }

Vary the angle of each email across the sequence (curiosity, benefits, trust/proof, objection handling, urgency) distributed across the {{email_count}} emails.

Return ONLY the JSON array.`,
  },
  social_posts: {
    system: 'You are a social media copywriter. Output ONLY valid JSON, no markdown fences.',
    user: `Product: {{product_name}}
Niche: {{niche}}
Tone: {{tone}}
Platforms: {{selected_platforms}}

Generate a JSON object with one key per selected platform from: facebook, twitter, instagram, linkedin.
Constraints:
- twitter.text must be 280 characters or fewer
- instagram must include "caption" and a "hashtags" array (5-8 relevant hashtags, no # symbol included in the strings)
- facebook and linkedin should be longer-form, platform-appropriate tone

Return ONLY the JSON object.`,
  },
  cta: {
    system:
      'You are a direct-response copywriter specializing in call-to-action lines. Output ONLY valid JSON, no markdown fences.',
    user: `Product: {{product_name}}
Niche: {{niche}}
Tone: {{tone}}
Placement context: {{placement_context}}
Number of variants: {{cta_count}}

Generate a JSON array of {{cta_count}} CTA objects with schema:
{ "button_text": string, "supporting_line": string, "urgency_level": "Low"|"Medium"|"High", "placement_context": string }

Return ONLY the JSON array.`,
  },
};

export function buildPrompt(assetType: AssetType, ctx: GeneratorContext, customInstruction?: string) {
  const tpl = PROMPT_TEMPLATES[assetType];
  const user = interpolate(tpl.user, ctx) + (customInstruction ? `\n\nAdditional instruction: ${customInstruction}` : '');
  return { system: tpl.system, user };
}
