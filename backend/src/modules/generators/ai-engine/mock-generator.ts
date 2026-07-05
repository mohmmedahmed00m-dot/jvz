import { AssetType, GeneratorContext } from '../generators.types';

/**
 * Deterministic local MOCK generator (dev fallback).
 *
 * Used automatically by the AI Engine when ANTHROPIC_API_KEY is absent/placeholder
 * or when the real Claude API call fails — so the entire system (and all tests)
 * run end-to-end WITHOUT a real key. When a valid key is configured in production,
 * the AI Engine calls the real Anthropic Claude Messages API instead (see
 * llm-client.service.ts). This is the ONLY documented deviation driven by the
 * requirement to run without real Anthropic credentials (documented in final report).
 *
 * Every output matches the exact schema defined in Section 3 for its generator.
 */
const PROS = [
  'Beginner-friendly setup that gets you running the same day',
  'Clear, step-by-step workflow with no confusing jargon',
  'Saves hours of manual copywriting and design work',
  'Backed by a responsive support team and active community',
  'Frequent updates that keep it working with platform changes',
  'Affordable compared to hiring a copywriter or agency',
  'Works across multiple niches without extra configuration',
];
const CONS = [
  'Some learning curve if you are brand new to affiliate marketing',
  'Results depend on the quality of your product research',
  'Requires consistent effort to see significant income',
];
const FEATURES = [
  { t: 'Automation', d: 'Hands-off generation that removes repetitive manual work so you focus on strategy.' },
  { t: 'Customization', d: 'Flexible tone and style controls let you match your brand voice exactly.' },
  { t: 'Speed', d: 'Produces a full launch kit in minutes instead of days of writing from scratch.' },
];

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function toneAdjective(tone: string): string {
  switch ((tone || '').toLowerCase()) {
    case 'hype': return 'game-changing';
    case 'casual': return 'handy';
    case 'trust-based': return 'reliable';
    default: return 'professional';
  }
}

export function mockGenerate(assetType: AssetType, ctx: GeneratorContext): string {
  const product = ctx.product_name || 'this product';
  const niche = ctx.niche || 'Make Money Online';
  const audience = ctx.target_audience || 'marketers';
  const adj = toneAdjective(ctx.tone);
  const ctaLink = ctx.product_url || '#cta-link';

  if (assetType === 'review') {
    const pros = PROS.slice(0, 6).map((p) => `      <li>${cap(p)}</li>`).join('\n');
    const cons = CONS.map((c) => `      <li>${c}</li>`).join('\n');
    const feats = FEATURES.map(
      (f) => `    <h3>${f.t}</h3>\n    <p>${f.d} For ${audience}, this means faster, more ${adj} results.</p>`,
    ).join('\n');
    return [
      `  <h1>${cap(product)} Review — A ${cap(adj)} Look in ${cap(niche)}</h1>`,
      `  <p>If you have been exploring the ${niche} space, ${cap(product)} has probably crossed your radar. In this review we break down what it does well, where it falls short, and whether it deserves a spot in your toolkit as ${audience}.</p>`,
      `  <p><strong>The short version:</strong> ${cap(product)} is a ${adj} choice for ${audience} who want real results without the usual overwhelm.</p>`,
      `  <ul class="pros">`,
      pros,
      `  </ul>`,
      `  <ul class="cons">`,
      cons,
      `  </ul>`,
      feats,
      `  <p><strong>Our verdict:</strong> After testing, ${cap(product)} earns a confident recommendation for ${audience}. It is not perfect, but the value it delivers clearly outweighs the drawbacks — especially at this price point.</p>`,
      `  <div class="cta-block">`,
      `    <p>Ready to get started with ${cap(product)}? Grab access now before the launch pricing ends.</p>`,
      `    <a href="${ctaLink}" class="cta-button">Get ${cap(product)} Now</a>`,
      `  </div>`,
    ].join('\n');
  }

  if (assetType === 'bonus') {
    const count = Math.min(Math.max(ctx.bonus_count ?? 3, 1), 10);
    const bonusNames = [
      'Quick-Start Implementation Guide',
      'Exclusive Swipe File Library',
      'Private Mastermind Access',
      'Done-For-You Templates Pack',
      'Advanced Traffic Playbook',
      'Conversion Optimization Checklist',
      'Email Follow-Up Sequence Kit',
      'Lifetime Update Notifications',
      'Priority Support Fast-Track',
      'Bonus Scaling Masterclass',
    ];
    const cards = bonusNames
      .slice(0, count)
      .map((name, i) => {
        const value = 47 + i * 13;
        return [
          `    <div class="bonus-card">`,
          `      <h3>${name}</h3>`,
          `      <p>A targeted companion for ${cap(product)} designed to help ${audience} get ${adj} results faster inside ${niche}.</p>`,
          `      <span class="value-tag">Value: $${value}</span>`,
          `    </div>`,
        ].join('\n');
      })
      .join('\n');
    return [
      `  <h1>Exclusive Bonuses for ${cap(product)}</h1>`,
      `  <p>When you grab ${cap(product)} through our link today, you also unlock these ${count} bonuses built to accelerate your success in ${niche}.</p>`,
      `  <div class="bonus-grid">`,
      cards,
      `  </div>`,
      `  <div class="cta-block">`,
      `    <p>These bonuses are available for a limited time. Secure ${cap(product)} and claim everything below now.</p>`,
      `    <a href="${ctaLink}" class="cta-button">Claim My Bonuses</a>`,
      `  </div>`,
    ].join('\n');
  }

  if (assetType === 'email_sequence') {
    const count = Math.min(Math.max(ctx.email_count ?? 5, 3), 10);
    const angles = [
      { subject: `The question about ${product} everyone asks`, angle: 'curiosity', body: `I get asked about ${product} all the time. Here is the honest answer no one else gives you about succeeding in ${niche} — and why ${audience} should care.` },
      { subject: `Why ${product} saves you serious time`, angle: 'benefits', body: `If you are tired of doing everything manually, ${product} handles the heavy lifting. Here is exactly how it helps ${audience} move faster.` },
      { subject: `Results others got with ${product}`, angle: 'social proof', body: `Plenty of ${audience} already use ${product} to win in ${niche}. Their results speak for themselves — here are a few that stood out.` },
      { subject: `The objection about ${product}, answered`, angle: 'objection handling', body: `"Is ${product} worth it?" It is a fair question. Let us address the biggest concern ${audience} have before deciding.` },
      { subject: `Last chance: ${product} launch pricing ends`, angle: 'urgency', body: `The special launch pricing for ${product} ends soon. If you have been on the fence, this is your sign to move.` },
      { subject: `How to start with ${product} today`, angle: 'action', body: `Getting started with ${product} is simpler than you think. Here is the fastest path for ${audience} to see results.` },
      { subject: `A ${niche} shortcut using ${product}`, angle: 'shortcut', body: `Here is a clever way ${audience} use ${product} to skip months of trial and error in ${niche}.` },
      { subject: `The hidden benefit of ${product}`, angle: 'hidden benefit', body: `Most reviews miss this, but ${product} has a benefit that is perfect for ${audience} focused on ${niche}.` },
      { subject: `Common ${product} mistakes to avoid`, angle: 'mistakes', body: `Before you dive into ${product}, avoid these mistakes that trip up even smart ${audience} in ${niche}.` },
      { subject: `Final reminder about ${product}`, angle: 'close', body: `This is the final note about ${product}. If it fits your goals in ${niche}, now is the time to act.` },
    ];
    const emails = angles.slice(0, count).map((a, i) => ({
      order: i + 1,
      subject: a.subject,
      preheader: `(${adj} angle: ${a.angle}) — open for the details on ${product}`,
      body: a.body,
      cta_text: i === count - 1 ? `Get ${cap(product)} Before It's Gone` : `See ${cap(product)} Details`,
    }));
    return JSON.stringify(emails, null, 2);
  }

  if (assetType === 'social_posts') {
    const platforms = ctx.platforms && ctx.platforms.length ? ctx.platforms : ['facebook', 'twitter', 'instagram', 'linkedin'];
    const obj: Record<string, unknown> = {};
    if (platforms.includes('facebook')) {
      obj.facebook = { text: `Just had to share this. ${cap(product)} is making waves in ${niche} and it is perfect for ${audience}. If you want a ${adj} edge, this is worth your attention. Tap below to check it out.` };
    }
    if (platforms.includes('twitter')) {
      const t = `${cap(product)} is a ${adj} pick for ${audience} in ${niche}. Worth a look — details below.`;
      obj.twitter = { text: t.slice(0, 280) };
    }
    if (platforms.includes('instagram')) {
      obj.instagram = {
        caption: `Found something genuinely useful for ${niche} fans. ${cap(product)} helps ${audience} get ${adj} results without the usual hassle. Swipe up to learn more.`,
        hashtags: ['affiliatemarketing', niche.toLowerCase().replace(/[^a-z0-9]/g, ''), product.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12), 'onlineincome', 'marketingtips', 'sidehustle', 'passiveincome', 'digitalproduct'],
      };
    }
    if (platforms.includes('linkedin')) {
      obj.linkedin = { text: `For professionals evaluating tools in ${niche}, ${cap(product)} offers a ${adj}, well-structured approach that benefits ${audience}. Here is a concise overview of why it stands out and how it fits a modern workflow.` };
    }
    return JSON.stringify(obj, null, 2);
  }

  // cta
  const count = Math.min(Math.max(ctx.cta_count ?? 5, 3), 10);
  const placement = ctx.placement_context || 'Review Page Button';
  const variants = [
    { button_text: `Get ${cap(product)} Now`, supporting_line: `Join ${audience} already seeing results in ${niche}.`, urgency_level: 'High' },
    { button_text: `Claim Instant Access`, supporting_line: `Secure your spot before launch pricing ends.`, urgency_level: 'High' },
    { button_text: `Start With ${cap(product)} Today`, supporting_line: `A ${adj} first step for ${audience}.`, urgency_level: 'Medium' },
    { button_text: `Try ${cap(product)} Risk-Free`, supporting_line: `Backed by a guarantee, so there is nothing to lose.`, urgency_level: 'Low' },
    { button_text: `Unlock ${cap(product)} Now`, supporting_line: `Get full access plus the launch bonuses.`, urgency_level: 'High' },
    { button_text: `See ${cap(product)} In Action`, supporting_line: `Watch how it works for ${audience}.`, urgency_level: 'Low' },
    { button_text: `Grab ${cap(product)} + Bonuses`, supporting_line: `Limited-time bonus bundle included.`, urgency_level: 'Medium' },
    { button_text: `Join Now`, supporting_line: `Simple, fast, and built for ${niche}.`, urgency_level: 'Medium' },
    { button_text: `Get Started Free`, supporting_line: `No commitment to explore ${cap(product)}.`, urgency_level: 'Low' },
    { button_text: `Reserve Your Copy`, supporting_line: `Only a few launch spots remain.`, urgency_level: 'High' },
  ].slice(0, count).map((v) => ({ ...v, placement_context: placement }));
  return JSON.stringify(variants, null, 2);
}
