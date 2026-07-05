import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds PostgreSQL triggers to protect encrypted columns from being
 * accidentally overwritten with plain-text values by TypeORM's
 * auto-save / identity-map mechanism.
 *
 * Columns protected:
 *  - licenses.license_key  (AES-256-GCM encrypted)
 *  - users.email           (AES-256-GCM encrypted)
 *  - generated_assets.content (AES-256-GCM encrypted)
 */
export class EncryptionGuardTriggers1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── licenses.license_key ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION guard_encrypted_license_key()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW.license_key IS NOT NULL AND NEW.license_key NOT LIKE '$aes256gcm$%' THEN
              NEW.license_key := OLD.license_key;
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER guard_license_key
          BEFORE INSERT OR UPDATE ON licenses
          FOR EACH ROW
          EXECUTE FUNCTION guard_encrypted_license_key();
    `);

    // ── users.email ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION guard_encrypted_email()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW.email IS NOT NULL AND NEW.email NOT LIKE '$aes256gcm$%' THEN
              NEW.email := OLD.email;
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER guard_email
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION guard_encrypted_email();
    `);

    // ── generated_assets.content ──────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION guard_encrypted_content()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW.content IS NOT NULL AND NEW.content NOT LIKE '$aes256gcm$%' THEN
              NEW.content := OLD.content;
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER guard_content
          BEFORE UPDATE ON generated_assets
          FOR EACH ROW
          EXECUTE FUNCTION guard_encrypted_content();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS guard_content ON generated_assets;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS guard_encrypted_content;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS guard_email ON users;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS guard_encrypted_email;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS guard_license_key ON licenses;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS guard_encrypted_license_key;`);
  }
}
