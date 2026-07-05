import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign, GeneratedAsset } from '../../database/entities';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { GeneratorsModule } from '../generators/generators.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, GeneratedAsset]), CryptoModule, GeneratorsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
