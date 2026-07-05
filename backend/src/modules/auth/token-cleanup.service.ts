import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { RevokedToken } from '../../database/entities';

/**
 * Periodic cleanup of expired revoked_tokens rows.
 *
 * Without this, every logout adds a row that never gets deleted.
 * After months → the table bloats → the jti lookup on each /refresh slows.
 *
 * Runs every hour via a simple setInterval (no external scheduler needed).
 * Safe to run on multiple replicas: DELETE WHERE expires_at < NOW() is idempotent.
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger('TokenCleanup');
  private interval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(RevokedToken)
    private readonly revokedRepo: Repository<RevokedToken>,
  ) {}

  onModuleInit() {
    // Run immediately on startup, then every hour
    this.cleanup();
    this.interval = setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async cleanup(): Promise<void> {
    try {
      const result = await this.revokedRepo.delete({
        expires_at: LessThan(new Date()),
      });
      if ((result.affected ?? 0) > 0) {
        this.logger.log(`Cleaned up ${result.affected} expired revoked token(s)`);
      }
    } catch (err) {
      this.logger.error(`Token cleanup failed: ${(err as Error).message}`);
    }
  }
}
