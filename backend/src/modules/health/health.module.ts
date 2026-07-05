import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'export' }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
