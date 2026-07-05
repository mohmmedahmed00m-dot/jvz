import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM Encryption Service — encrypts/decrypts sensitive data at rest.
 *
 * Why GCM?
 *   - Authenticated encryption: detects tampering (integrity + confidentiality).
 *   - No padding oracle attacks (unlike CBC).
 *   - Industry standard (NIST SP 800-38D, RFC 5116).
 *
 * Storage format:  base64( iv[12] + authTag[16] + ciphertext )
 *   - IV: 12 bytes (NIST recommendation for GCM)
 *   - Auth Tag: 16 bytes (128-bit)
 *   - Ciphertext: variable length
 *
 * Key derivation: scrypt (password → 32-byte key) with a fixed salt derived
 *   from ENCRYPTION_KEY. This allows key rotation by changing the env var.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger('Encryption');
  private readonly key: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12;
  private readonly AUTH_TAG_LENGTH = 16;

  constructor(private readonly config: ConfigService) {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY') ?? '';
    if (!encryptionKey || encryptionKey.length < 16) {
      this.logger.warn('ENCRYPTION_KEY is weak or missing — using dev-insecure key. SET A STRONG KEY IN PRODUCTION!');
    }
    // Derive a 32-byte key via scrypt (N=16384, r=8, p=1)
    const salt = 'JVzo-AES256-GCM-KeyDerivation-Salt-2024';
    this.key = scryptSync(encryptionKey || 'dev-insecure-encryption-key-rotate-me', salt, 32);
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   * Returns base64(iv + authTag + ciphertext).
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const iv = randomBytes(this.IV_LENGTH);
    const cipher = createCipheriv(this.ALGORITHM, this.key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Prepend a marker so we can detect encrypted vs unencrypted data
    const result = Buffer.concat([iv, authTag, encrypted]);
    return '$aes256gcm$' + result.toString('base64');
  }

  /**
   * Decrypt a value encrypted by this service.
   * Handles both encrypted ($aes256gcm$...) and plain (unencrypted) values
   * for backward compatibility with existing data.
   */
  decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;

    // If not marked as encrypted, return as-is (backward compatibility)
    if (!ciphertext.startsWith('$aes256gcm$')) {
      return ciphertext;
    }

    const b64 = ciphertext.slice('$aes256gcm$'.length);
    const buf = Buffer.from(b64, 'base64');

    if (buf.length < this.IV_LENGTH + this.AUTH_TAG_LENGTH) {
      this.logger.error('Encrypted data too short — returning as-is');
      return ciphertext;
    }

    const iv = buf.subarray(0, this.IV_LENGTH);
    const authTag = buf.subarray(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(this.IV_LENGTH + this.AUTH_TAG_LENGTH);

    try {
      const decipher = createDecipheriv(this.ALGORITHM, this.key, iv, {
        authTagLength: this.AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (err) {
      this.logger.error(`Decryption failed: ${(err as Error).message}`);
      throw new Error('Decryption failed — data may be corrupted or key mismatch');
    }
  }

  /**
   * Check if a value is encrypted (has our marker prefix).
   */
  isEncrypted(value: string): boolean {
    return !!value && value.startsWith('$aes256gcm$');
  }
}
