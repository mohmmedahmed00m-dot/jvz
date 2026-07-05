import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const REQUIRED = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'JVZOO_SECRET_KEY',
    'ENCRYPTION_KEY',
    'HASH_SECRET',
  ];
  const INSECURE = ['dev-insecure', 'placeholder', 'fake', 'secret', 'change-me', 'changeme'];

  const errors: string[] = [];
  for (const key of REQUIRED) {
    const val = process.env[key] ?? '';
    if (!val) {
      errors.push(`${key} is missing`);
    } else if (INSECURE.some((bad) => val.toLowerCase().includes(bad))) {
      errors.push(`${key} contains an insecure placeholder value`);
    }
  }

  // Only require an AI key when real LLM mode is active.
  // When AI_USE_REAL_LLM=false the app runs in mock mode and no key is needed.
  const useRealLlm = (process.env.AI_USE_REAL_LLM ?? 'true').toLowerCase() !== 'false';
  if (useRealLlm) {
    const provider = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();
    const providerKeyMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY',
      groq: 'GROQ_API_KEY',
    };
    const providerKey = providerKeyMap[provider] ?? 'ANTHROPIC_API_KEY';
    const keyVal = process.env[providerKey] ?? '';
    if (!keyVal || INSECURE.some((bad) => keyVal.toLowerCase().includes(bad))) {
      errors.push(`${providerKey} is required for AI_PROVIDER=${provider} but is missing or insecure`);
    }
  }

  if (errors.length) {
    console.error('FATAL: Production secrets validation failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  const frontendUrl = config.get<string>('FRONTEND_BASE_URL') ?? 'http://localhost:5173';
  const isProd = config.get<string>('NODE_ENV') === 'production';

  // ── Trust proxy: required for correct IP behind Nginx/load-balancer ──────
  // Without this, ThrottlerGuard sees the proxy IP (always same) instead of
  // the real client IP, making rate-limiting ineffective in production.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // ── Body size limit: prevents DoS via oversized payloads ─────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // ── CORS: strict in production, relaxed in dev ────────────────────────────
  const allowedOrigins = isProd
    ? [frontendUrl]                                               // prod: only real domain
    : [frontendUrl, 'http://127.0.0.1:5173', 'http://localhost:5173']; // dev: localhost OK

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strip unknown properties
      transform: true,        // auto-transform primitives
      forbidNonWhitelisted: true,  // reject requests with unknown fields (was false — fixed)
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Graceful shutdown: drains in-flight requests before process exits ────
  app.enableShutdownHooks();

  await app.listen(port);
  new Logger('Bootstrap').log(
    `🚀 Backend on http://localhost:${port}/api (env=${config.get('NODE_ENV')}, ` +
    `provider=${config.get('AI_PROVIDER')}, real_llm=${config.get('AI_USE_REAL_LLM')}, ` +
    `cors=${allowedOrigins.join(',')})`,
  );
}
bootstrap();
