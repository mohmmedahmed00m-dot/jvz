import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { randomUUID, timingSafeEqual, createHash } from 'crypto';
import { License, User } from '../../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { HashService } from '../../common/crypto/hash.service';

export interface JvzooIpnPayload {
  [key: string]: string;
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

@Injectable()
export class LicensingService {
  private readonly logger = new Logger('Licensing');

  constructor(
    @InjectRepository(License) private readonly licenseRepo: Repository<License>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
    private readonly hashService: HashService,
  ) {}

  async getUserLicenseStatus(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['license'],
    });
    if (!user) return 'none';
    if (!user.license) return 'none';
    return user.license.status;
  }

  // ─── O(1) license key lookup via license_key_hash ─────────────────────────
  private async findLicenseByKey(licenseKey: string): Promise<License | null> {
    const keyHash = this.hashService.hash(licenseKey);

    // Fast path: O(1) indexed lookup
    const license = await this.licenseRepo.findOne({ where: { license_key_hash: keyHash } });
    if (license) return license;

    // Slow-path migration for legacy rows without hash
    const legacy = await this.licenseRepo
      .createQueryBuilder('l')
      .where('l.license_key_hash IS NULL AND l.status = :status', { status: 'active' })
      .getMany();

    for (const l of legacy) {
      const decrypted = this.encryption.decrypt(l.license_key);
      if (decrypted === licenseKey) {
        // Backfill hash
        await this.licenseRepo.update(l.id, { license_key_hash: keyHash });
        l.license_key_hash = keyHash;
        return l;
      }
    }
    return null;
  }

  async validateLicenseKey(licenseKey: string): Promise<License> {
    const license = await this.findLicenseByKey(licenseKey);
    if (!license || license.status !== 'active') {
      throw new BadRequestException({ code: 'INVALID_LICENSE', message: 'Invalid license key' });
    }
    return license;
  }

  private decryptLicenseKey(license: License): string {
    return this.encryption.decrypt(license.license_key);
  }

  async activateLicenseForUser(
    userId: string,
    licenseKey: string,
  ): Promise<{ status: string; activated_at: Date }> {
    const license = await this.findLicenseByKey(licenseKey);
    if (!license || license.status !== 'active') {
      throw new BadRequestException({ code: 'INVALID_LICENSE', message: 'Invalid license key' });
    }
    const licenseId = license.id;

    return this.dataSource.transaction(async (mgr) => {
      const userRows = await mgr.query(`SELECT license_id FROM users WHERE id = $1`, [userId]);
      if (!userRows.length) throw new NotFoundException('User not found');

      const existingLicenseId = userRows[0].license_id;
      if (existingLicenseId && existingLicenseId !== licenseId) {
        throw new BadRequestException({
          code: 'LICENSE_ALREADY_LINKED',
          message: 'This account already has a different license linked',
        });
      }

      await mgr.query(`UPDATE users SET license_id = $1 WHERE id = $2`, [licenseId, userId]);
      await mgr.query(
        `UPDATE licenses SET activated_at = COALESCE(activated_at, NOW()) WHERE id = $1`,
        [licenseId],
      );

      this.logger.log(`License activated for user ${userId}`);
      const licRows = await mgr.query(`SELECT activated_at FROM licenses WHERE id = $1`, [licenseId]);
      return { status: 'active', activated_at: licRows[0]?.activated_at ?? new Date() };
    });
  }

  verifyJvzooSignature(payload: JvzooIpnPayload, secret: string): boolean {
    const received = payload['cverify'];
    if (!received) return false;
    const fields = { ...payload };
    delete fields['cverify'];
    const keys = Object.keys(fields).sort();
    const concatenated = keys.map((k) => fields[k] ?? '').join('') + secret;
    const computed = createHash('md5').update(concatenated).digest('hex');
    return safeEqualHex(computed.toLowerCase(), received.toLowerCase());
  }

  async handleJvzooIpn(payload: JvzooIpnPayload): Promise<{ status: string }> {
    const txnType = (payload['ctransaction'] || '').toUpperCase();
    const txnId = payload['ctransreceipt'] || '';
    const customerEmail = payload['ccustemail'] || '';

    this.logger.log(`JVZoo IPN received: txnType=${txnType} txnId=${txnId}`);

    if (txnType === 'SALE') {
      const existing = txnId
        ? await this.licenseRepo.findOne({ where: { jvzoo_transaction_id: txnId } })
        : null;
      let license = existing;
      if (!license) {
        const licenseKey = this.generateLicenseKey();
        const keyHash = this.hashService.hash(licenseKey);
        const candidate = this.licenseRepo.create({
          license_key: this.encryption.encrypt(licenseKey),
          license_key_hash: keyHash,
          source: 'jvzoo',
          jvzoo_transaction_id: txnId || null,
          status: 'active',
        });
        try {
          license = await this.dataSource.transaction(async (mgr) => mgr.save(candidate));
          this.logger.log(`Created license for txn ${txnId}`);
        } catch (err) {
          if (err instanceof QueryFailedError && (err as any).code === '23505' && txnId) {
            license = await this.licenseRepo.findOne({ where: { jvzoo_transaction_id: txnId } });
            this.logger.log(`Idempotent: license for txn ${txnId} already existed`);
          } else {
            throw err;
          }
        }
      }
      if (license && customerEmail) {
        const decryptedKey = this.decryptLicenseKey(license);
        await this.notifications.sendLicenseKey(customerEmail, decryptedKey);
      }
      return { status: 'ok' };
    }

    if (txnType === 'REFUND' || txnType === 'CGBK') {
      const finalStatus = txnType === 'REFUND' ? 'refunded' : 'revoked';
      await this.dataSource.transaction(async (mgr) => {
        const license = txnId
          ? await mgr.findOne(License, { where: { jvzoo_transaction_id: txnId } })
          : null;
        if (license) {
          license.status = finalStatus;
          await mgr.save(license);
          this.logger.warn(`License set to ${finalStatus} (txn ${txnId})`);
        } else {
          this.logger.warn(`Refund/chargeback for unknown txn ${txnId}`);
        }
      });
      return { status: 'ok' };
    }

    this.logger.log(`JVZoo IPN ignored (txnType=${txnType})`);
    return { status: 'ignored' };
  }

  private generateLicenseKey(): string {
    const part = () => randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    return `ALK-${part()}-${part()}-${part()}-${part()}`;
  }
}
