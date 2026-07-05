import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { User, RevokedToken } from '../../database/entities';
import { LicensingService } from '../licensing/licensing.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { HashService } from '../../common/crypto/hash.service';

const BCRYPT_COST = 12;
const ACCESS_TTL_SECONDS = 60 * 15;       // 15 minutes
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AccessPayload {
  sub: string;
  email: string;
  license_status: string;
  type: 'access';
  jti: string;
}
export interface RefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RevokedToken) private readonly revokedRepo: Repository<RevokedToken>,
    private readonly jwt: JwtService,
    private readonly licensing: LicensingService,
    private readonly encryption: EncryptionService,
    private readonly hashService: HashService,
    private readonly config: ConfigService,
  ) {}

  // ─── O(1) user lookup via email_hash ──────────────────────────────────────
  private async findUserByEmail(email: string): Promise<User | null> {
    const emailHash = this.hashService.hash(email);

    // Fast path: lookup by hash (O(1) indexed query)
    const user = await this.userRepo.findOne({ where: { email_hash: emailHash } });
    if (user) return user;

    // Slow-path migration: if no hash match, scan legacy rows without a hash
    // and backfill on first successful match. Removes itself once all rows migrated.
    const legacy = await this.userRepo
      .createQueryBuilder('u')
      .where('u.email_hash IS NULL')
      .getMany();

    for (const u of legacy) {
      const decrypted = this.encryption.decrypt(u.email);
      if (decrypted === email.toLowerCase()) {
        // Backfill the hash so next login is O(1)
        u.email_hash = emailHash;
        await this.userRepo.save(u);
        return u;
      }
    }
    return null;
  }

  async register(email: string, password: string) {
    const emailNorm = email.toLowerCase().trim();
    const emailHash = this.hashService.hash(emailNorm);

    // O(1) duplicate check
    const existing = await this.userRepo.findOne({ where: { email_hash: emailHash } });
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_COST);
    const encryptedEmail = this.encryption.encrypt(emailNorm);

    const user = this.userRepo.create({
      email: encryptedEmail,
      email_hash: emailHash,
      password_hash,
    });
    await this.userRepo.save(user);

    const { accessToken, refreshToken } = await this.issueTokens(user.id, 'none', emailNorm);
    user.email = emailNorm; // return plain for response
    return { user, accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const emailNorm = email.toLowerCase().trim();

    // O(1) lookup
    const user = await this.findUserByEmail(emailNorm);
    if (!user) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const licenseStatus = await this.licensing.getUserLicenseStatus(user.id);
    const { accessToken, refreshToken } = await this.issueTokens(user.id, licenseStatus, emailNorm);
    user.email = emailNorm;
    return { user, accessToken, refreshToken, licenseStatus };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException({ code: 'NO_REFRESH_TOKEN', message: 'Missing refresh token' });
    }
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' });
    }
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Malformed refresh token' });
    }
    const revoked = await this.revokedRepo.findOne({ where: { jti: payload.jti } });
    if (revoked) {
      throw new UnauthorizedException({ code: 'REVOKED_TOKEN', message: 'Refresh token revoked' });
    }
    const licenseStatus = await this.licensing.getUserLicenseStatus(payload.sub);
    const { accessToken } = await this.issueTokens(payload.sub, licenseStatus);
    return { accessToken };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.jti) {
        const exists = await this.revokedRepo.findOne({ where: { jti: payload.jti } });
        if (!exists) {
          await this.revokedRepo.save(
            this.revokedRepo.create({
              jti: payload.jti,
              expires_at: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
            }),
          );
        }
      }
    } catch {
      // Already invalid/expired — nothing to revoke.
    }
  }

  async activateLicense(userId: string, licenseKey: string) {
    const license = await this.licensing.activateLicenseForUser(userId, licenseKey);
    return { status: license.status, activated_at: license.activated_at };
  }

  validatePassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }

  async getUserWithPassword(email: string): Promise<User | null> {
    const user = await this.findUserByEmail(email.toLowerCase().trim());
    if (user) user.email = this.encryption.decrypt(user.email);
    return user;
  }

  private async issueTokens(userId: string, licenseStatus: string, email = '') {
    const refreshJti = randomUUID();
    const accessPayload: AccessPayload = {
      sub: userId,
      email,
      license_status: licenseStatus,
      type: 'access',
      jti: randomUUID(),
    };
    const refreshPayload: RefreshPayload = { sub: userId, type: 'refresh', jti: refreshJti };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: ACCESS_TTL_SECONDS,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TTL_SECONDS,
    });
    return { accessToken, refreshToken, refreshJti };
  }

  ACCESS_TTL_SECONDS = ACCESS_TTL_SECONDS;
  REFRESH_TTL_SECONDS = REFRESH_TTL_SECONDS;
}
