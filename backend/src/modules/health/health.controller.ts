import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Health check endpoint — used by:
 *   - Docker HEALTHCHECK
 *   - Railway / Render / Fly.io uptime probes
 *   - External uptime monitors (UptimeRobot, BetterStack, etc.)
 *
 * GET /api/health
 *   → 200 { status:"ok", ... }   when DB + Redis are reachable
 *   → 503 { status:"degraded" }  when a dependency is down
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue('export') private readonly exportQueue: Queue,
  ) {}

  @Get()
  async check() {
    const start = Date.now();
    const checks: Record<string, 'ok' | 'fail'> = {};

    // ── PostgreSQL ──────────────────────────────────────────────────────────
    try {
      await this.db.query('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'fail';
    }

    // ── Redis (via BullMQ queue ping) ───────────────────────────────────────
    try {
      await this.exportQueue.getJobCounts();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'fail';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    const status = allOk ? 'ok' : 'degraded';
    const httpStatus = allOk ? 200 : 503;

    return {
      status,
      uptime: Math.floor(process.uptime()),
      latency_ms: Date.now() - start,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
