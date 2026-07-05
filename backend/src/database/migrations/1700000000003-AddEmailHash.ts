import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix #1 — O(n) login problem:
 * Add email_hash column (HMAC-SHA256) to users table for O(1) lookup.
 * Encryption at rest is preserved (email column stays AES-256-GCM),
 * but we can now do WHERE email_hash = ? for fast lookups without
 * decrypting every row.
 *
 * Also add license_key_hash to licenses for the same reason.
 */
export class AddEmailHash1700000000003 implements MigrationInterface {
  name = 'AddEmailHash1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add email_hash column to users
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_hash" varchar(64);
    `);

    // Add unique index on email_hash (will be populated by the app on next login/register)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_users_email_hash"
      ON "users" ("email_hash")
      WHERE "email_hash" IS NOT NULL;
    `);

    // Add license_key_hash column to licenses
    await queryRunner.query(`
      ALTER TABLE "licenses"
      ADD COLUMN IF NOT EXISTS "license_key_hash" varchar(64);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_licenses_key_hash"
      ON "licenses" ("license_key_hash")
      WHERE "license_key_hash" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ux_licenses_key_hash";`);
    await queryRunner.query(`ALTER TABLE "licenses" DROP COLUMN IF EXISTS "license_key_hash";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ux_users_email_hash";`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_hash";`);
  }
}
