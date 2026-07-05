import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { resolve } from 'path';
import configuration from './config/configuration';
import {
  User,
  Campaign,
  GeneratedAsset,
  Template,
  License,
  Export,
  RevokedToken,
} from './database/entities';
import { LicenseKeyGuardSubscriber } from './database/subscribers/license-key-guard.subscriber';
import { CryptoModule } from './common/crypto/crypto.module';
import { LoggerModule } from './common/logger/logger.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { GeneratorsModule } from './modules/generators/generators.module';
import { ExportModule } from './modules/export/export.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';

// Load .env eagerly from an ABSOLUTE path so the process cwd never matters.
// Without this, launching the server from another working directory fails to
// find .env and every secret (DATABASE_URL etc.) becomes undefined.
import * as dotenv from 'dotenv';
dotenv.config({ path: resolve(__dirname, '..', '.env') });

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '..', '.env'),
      load: [configuration],
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,    // 60 seconds window
      limit: 100,    // 100 requests per window
    }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [User, Campaign, GeneratedAsset, Template, License, Export, RevokedToken],
        subscribers: [LicenseKeyGuardSubscriber],
        synchronize: false, // schema managed by migrations (Section 4)
        logging: config.get<string>('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL')! },
      }),
    }),
    CryptoModule,
    LoggerModule,
    HealthModule,
    NotificationsModule,
    LicensingModule,
    AuthModule,
    GeneratorsModule,
    CampaignsModule,
    ExportModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
