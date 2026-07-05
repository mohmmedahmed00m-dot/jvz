import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, RevokedToken } from '../../database/entities';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TokenCleanupService } from './token-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RevokedToken]),
    PassportModule,
    JwtModule.register({}),
    CryptoModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
