import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

/**
 * HMAC-SHA256 hashing service for searchable-encrypted fields.
 *
 * Problem it solves:
 *   Emails and license keys are stored AES-256-GCM encrypted (different IV
 *   each time → different ciphertext). You can't do WHERE email = ? on them.
 *   Without this, every login requires fetching ALL users and decrypting every
 *   email — O(n) per request, fatal at scale.
 *
 * Solution:
 *   Store a deterministic HMAC-SHA256(secret, value) alongside the encrypted
 *   value. The hash is not reversible (HMAC secret is server-side), so it
 *   leaks nothing useful even if the DB is breached, yet allows O(1) lookup.
 *
 * Usage:
 *   write:  user.email_hash = hashService.hash(email)
 *   lookup: WHERE email_hash = hashService.hash(inputEmail)
 */
@Injectable()
export class HashService {
  private readonly logger = new Logger('HashService');
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    // Use a dedicated HMAC secret separate from JWT and encryption keys.
    // Falls back to a dev-only value with a loud warning.
    this.secret =
      this.config.get<string>('HASH_SECRET') ??
      this.config.get<string>('ENCRYPTION_KEY') ??
      'dev-insecure-hash-secret-set-HASH_SECRET-in-production';

    if (!this.config.get<string>('HASH_SECRET')) {
      this.logger.warn(
        'HASH_SECRET not set — falling back to ENCRYPTION_KEY. Set HASH_SECRET in production!',
      );
    }
  }

  /**
   * Returns a hex HMAC-SHA256 of the normalised (lowercased) value.
   * Always normalise before hashing so lookup is case-insensitive.
   */
  hash(value: string): string {
    return createHmac('sha256', this.secret)
      .update(value.toLowerCase().trim())
      .digest('hex');
  }
}
