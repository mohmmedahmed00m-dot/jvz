export type AssetType = 'review' | 'bonus' | 'email_sequence' | 'social_posts' | 'cta';

export const ALL_ASSET_TYPES: AssetType[] = [
  'review',
  'bonus',
  'email_sequence',
  'social_posts',
  'cta',
];

export type ContentFormat = 'html' | 'json' | 'text';

export const ASSET_FORMAT: Record<AssetType, ContentFormat> = {
  review: 'html',
  bonus: 'html',
  email_sequence: 'json',
  social_posts: 'json',
  cta: 'json',
};

export interface GeneratorContext {
  product_name: string;
  product_url?: string;
  niche?: string;
  tone: string;
  target_audience?: string;
  // per-generator parameters (optional, defaults applied per Section 3)
  bonus_count?: number;
  email_count?: number;
  platforms?: string[];
  cta_count?: number;
  placement_context?: string;
  // section toggles (Review customization, Section 3.1)
  include_cons?: boolean;
  include_verdict?: boolean;
}

export interface GenerateResult {
  content: string;
  content_format: ContentFormat;
}

export const TONE_OPTIONS = ['professional', 'casual', 'hype', 'trust-based'] as const;
export const NICHE_OPTIONS = [
  'Make Money Online',
  'Health',
  'SaaS Tools',
  'Crypto',
  'E-commerce',
  'Education',
] as const;
export const PLATFORM_OPTIONS = ['facebook', 'twitter', 'instagram', 'linkedin'] as const;
