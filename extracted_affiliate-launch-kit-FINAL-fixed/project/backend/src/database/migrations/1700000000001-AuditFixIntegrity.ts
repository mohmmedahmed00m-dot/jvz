import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit fix migration — adds data-integrity constraints identified in STEP 2:
 *  - #2: UNIQUE on licenses.jvzoo_transaction_id (partial, non-null) → idempotent IPN.
 *  - #6: UNIQUE on generated_assets (campaign_id, asset_type) → no duplicate assets.
 *
 * These enforce idempotency at the DB level so application-level checks cannot
 * be defeated by concurrent requests (race conditions / JVZoo retries).
 */
export class AuditFixIntegrity1700000000001 implements MigrationInterface {
  name = 'AuditFixIntegrity1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Clean up any pre-existing duplicates before adding constraints (safety).
    await queryRunner.query(`
      DELETE FROM licenses a USING licenses b
      WHERE a.id > b.id
        AND a.jvzoo_transaction_id IS NOT NULL
        AND a.jvzoo_transaction_id = b.jvzoo_transaction_id;
    `);
    await queryRunner.query(`
      DELETE FROM generated_assets a USING generated_assets b
      WHERE a.id > b.id
        AND a.campaign_id = b.campaign_id
        AND a.asset_type = b.asset_type;
    `);

    // Partial unique index: only one active license per JVZoo transaction.
    // NULLs are excluded (manual/offline licenses have no txn).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_licenses_jvzoo_txn"
      ON "licenses" ("jvzoo_transaction_id")
      WHERE "jvzoo_transaction_id" IS NOT NULL;
    `);

    // Exactly one asset row per (campaign, asset_type).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_assets_campaign_type"
      ON "generated_assets" ("campaign_id", "asset_type");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ux_assets_campaign_type";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ux_licenses_jvzoo_txn";`);
  }
}
