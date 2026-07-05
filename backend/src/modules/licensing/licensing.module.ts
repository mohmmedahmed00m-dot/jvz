import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { License, User } from '../../database/entities';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { LicensingService } from './licensing.service';
import { LicensingController } from './licensing.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([License, User]), CryptoModule],
  providers: [LicensingService],
  controllers: [LicensingController],
  exports: [LicensingService],
})
export class LicensingModule {}
