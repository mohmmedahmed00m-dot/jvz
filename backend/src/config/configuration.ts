import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env once (NestJS ConfigModule also loads it, but we ensure it for the
// TypeORM CLI data-source which runs outside the Nest bootstrap).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'groq';

export interface AppConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  HASH_SECRET: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  AI_PROVIDER: AiProvider;
  AI_USE_REAL_LLM: boolean;
  OPENAI_MODEL: string;
  GEMINI_MODEL: string;
  GROQ_MODEL: string;
  ENCRYPTION_KEY: string;
  JVZOO_SECRET_KEY: string;
  S3_BUCKET_NAME: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_REGION: string;
  EMAIL_PROVIDER_API_KEY: string;
  EMAIL_FROM_ADDRESS: string;
  REDIS_URL: string;
  FRONTEND_BASE_URL: string;
  NODE_ENV: string;
  PORT: number;
}

function boolFromEnv(v: string | undefined): boolean {
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true';
}

function resolveAiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? '').toLowerCase();
  if (raw === 'openai' || raw === 'gpt') return 'openai';
  if (raw === 'gemini' || raw === 'google') return 'gemini';
  if (raw === 'groq') return 'groq';
  if (raw === 'anthropic' || raw === 'claude') return 'anthropic';

  // Auto-detect: if only one real key is set, use that provider
  const hasAnthropic = hasRealKey(process.env.ANTHROPIC_API_KEY, 'sk-ant-');
  const hasOpenai = hasRealKey(process.env.OPENAI_API_KEY, 'sk-');
  const hasGemini = hasRealKey(process.env.GEMINI_API_KEY, 'AI');
  const hasGroq = hasRealKey(process.env.GROQ_API_KEY, 'gsk_');

  if (!hasAnthropic && !hasOpenai && !hasGemini && hasGroq) return 'groq';
  if (!hasAnthropic && hasOpenai && !hasGemini) return 'openai';
  if (!hasAnthropic && !hasOpenai && hasGemini) return 'gemini';
  if (!hasAnthropic && hasOpenai && hasGemini) return 'openai';

  // Default to anthropic for backward compatibility
  return 'anthropic';
}

function hasRealKey(val: string | undefined, prefix: string): boolean {
  if (!val) return false;
  if (val.includes('fake') || val.includes('placeholder')) return false;
  if (val === 'sk-ant-...') return false;
  return val.startsWith(prefix) || val.length > 20;
}

function shouldUseRealLlm(provider: AiProvider): boolean {
  const override = process.env.AI_USE_REAL_LLM;
  if (override !== undefined) return boolFromEnv(override);

  // In production, check if the selected provider has a real key
  if (process.env.NODE_ENV === 'production') {
    if (provider === 'openai') return hasRealKey(process.env.OPENAI_API_KEY, 'sk-');
    if (provider === 'gemini') return hasRealKey(process.env.GEMINI_API_KEY, 'AI');
    if (provider === 'groq') return hasRealKey(process.env.GROQ_API_KEY, 'gsk_');
    return hasRealKey(process.env.ANTHROPIC_API_KEY, 'sk-ant-');
  }
  return false;
}

export default (): AppConfig => {
  const provider = resolveAiProvider();
  const aiUseReal = shouldUseRealLlm(provider);

  return {
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost:5432/affiliate_launch_kit',
    JWT_SECRET: process.env.JWT_SECRET ?? 'dev-insecure-jwt-secret',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'dev-insecure-refresh-secret',
    HASH_SECRET: process.env.HASH_SECRET ?? process.env.ENCRYPTION_KEY ?? 'dev-insecure-hash-secret',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
    GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
    AI_PROVIDER: provider,
    AI_USE_REAL_LLM: aiUseReal,
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-4o',
    GEMINI_MODEL: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    GROQ_MODEL: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'dev-insecure-encryption-key-rotate-me',
    JVZOO_SECRET_KEY: process.env.JVZOO_SECRET_KEY ?? 'jvzoo-dev-secret',
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME ?? 'affiliate-launch-kit-exports-dev',
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? '',
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? '',
    S3_REGION: process.env.S3_REGION ?? 'us-east-1',
    EMAIL_PROVIDER_API_KEY: process.env.EMAIL_PROVIDER_API_KEY ?? '',
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS ?? 'onboarding@resend.dev',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173',
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: parseInt(process.env.PORT ?? '3000', 10),
  };
};
