import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema — creates all tables from Section 4 of the Technical Blueprint.
 * Exact column names / types match the blueprint field definitions.
 */
export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    /* ----------------------------- licenses ----------------------------- */
    await queryRunner.query(`
      CREATE TABLE "licenses" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "license_key"           varchar(100) NOT NULL UNIQUE,
        "source"                varchar(50)  NOT NULL,
        "jvzoo_transaction_id"  varchar(100),
        "status"                varchar(50)  NOT NULL DEFAULT 'active',
        "activated_at"          timestamptz,
        "created_at"            timestamptz NOT NULL DEFAULT now()
      );
    `);

    /* ------------------------------ users ------------------------------- */
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email"          varchar(255) NOT NULL UNIQUE,
        "password_hash"  varchar(255) NOT NULL,
        "license_id"     uuid,
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        "updated_at"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_users_license" FOREIGN KEY ("license_id")
          REFERENCES "licenses"("id") ON DELETE SET NULL
      );
      CREATE INDEX "ix_users_license_id" ON "users"("license_id");
    `);

    /* ----------------------------- templates ---------------------------- */
    await queryRunner.query(`
      CREATE TABLE "templates" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "asset_type"       varchar(50) NOT NULL,
        "prompt_template"  text NOT NULL,
        "version"          int NOT NULL DEFAULT 1,
        "is_active"        boolean NOT NULL DEFAULT true,
        "created_at"       timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "ix_templates_asset_type" ON "templates"("asset_type");
      CREATE INDEX "ix_templates_is_active" ON "templates"("is_active");
    `);

    /* ----------------------------- campaigns ---------------------------- */
    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"           uuid NOT NULL,
        "product_name"      varchar(255) NOT NULL,
        "product_url"       varchar(500),
        "niche"             varchar(100),
        "tone"              varchar(50)  NOT NULL DEFAULT 'professional',
        "target_audience"   varchar(255),
        "status"            varchar(50)  NOT NULL DEFAULT 'draft',
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_campaigns_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );
      CREATE INDEX "ix_campaigns_user_id" ON "campaigns"("user_id");
    `);

    /* -------------------------- generated_assets ------------------------ */
    await queryRunner.query(`
      CREATE TABLE "generated_assets" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "campaign_id"     uuid NOT NULL,
        "asset_type"      varchar(50) NOT NULL,
        "content_format"  varchar(20) NOT NULL,
        "content"         text NOT NULL,
        "version"         int NOT NULL DEFAULT 1,
        "is_manual_edit"  boolean NOT NULL DEFAULT false,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_assets_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE
      );
      CREATE INDEX "ix_assets_campaign_id" ON "generated_assets"("campaign_id");
      CREATE INDEX "ix_assets_asset_type"  ON "generated_assets"("asset_type");
    `);

    /* ------------------------------ exports ----------------------------- */
    await queryRunner.query(`
      CREATE TABLE "exports" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "campaign_id"        uuid NOT NULL,
        "format_selection"   jsonb NOT NULL,
        "storage_path"       varchar(500) NOT NULL,
        "status"             varchar(50) NOT NULL DEFAULT 'pending',
        "created_at"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_exports_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE
      );
      CREATE INDEX "ix_exports_campaign_id" ON "exports"("campaign_id");
    `);

    /* --------------------------- revoked_tokens ------------------------- */
    await queryRunner.query(`
      CREATE TABLE "revoked_tokens" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "jti"         varchar(255) NOT NULL UNIQUE,
        "expires_at"  timestamptz NOT NULL
      );
      CREATE INDEX "ix_revoked_tokens_jti" ON "revoked_tokens"("jti");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "revoked_tokens";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "exports";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "generated_assets";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "templates";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "licenses";`);
  }
}
