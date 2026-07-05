import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Export, Campaign, GeneratedAsset } from '../../database/entities';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { ExportController } from './export.controller';
import { ExportService, EXPORT_QUEUE } from './export.service';
import { ExportPackagerService } from './export-packager.service';
import { ExportProcessor } from './export.processor';
import { StorageService } from './storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Export, Campaign, GeneratedAsset]),
    BullModule.registerQueue({ name: EXPORT_QUEUE }),
    CryptoModule,
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportPackagerService, ExportProcessor, StorageService],
  exports: [ExportService, StorageService],
})
export class ExportModule {}
