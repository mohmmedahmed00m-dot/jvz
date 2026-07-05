import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeneratedAsset, Template } from '../../database/entities';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { GeneratorsService } from './generators.service';
import { AiEngineService } from './ai-engine/ai-engine.service';
import { LlmClientService } from './ai-engine/llm-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GeneratedAsset, Template]),
    CryptoModule,
  ],
  providers: [GeneratorsService, AiEngineService, LlmClientService],
  exports: [GeneratorsService, AiEngineService],
})
export class GeneratorsModule {}
