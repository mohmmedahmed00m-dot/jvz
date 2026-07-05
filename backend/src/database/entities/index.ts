import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

/* =============================================================================
 * Entity definitions — map EXACTLY to Section 4 of the Technical Blueprint.
 * Tables: Users, Campaigns, GeneratedAssets, Templates, Licenses, Exports
 * Plus RevokedTokens (Section 6.4 logout denylist, keyed by jti).
 * =========================================================================== */

/* ----------------------------- Licenses ----------------------------------- */
@Entity('licenses')
export class License {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  license_key: string;

  // HMAC-SHA256 of plain license key — enables O(1) lookup
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, name: 'license_key_hash', nullable: true })
  license_key_hash: string | null;

  @Column({ type: 'varchar', length: 50 })
  source: string; // e.g. "jvzoo"

  @Column({ type: 'varchar', length: 100, nullable: true })
  jvzoo_transaction_id: string | null;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string; // active / revoked / refunded

  @Column({ type: 'timestamptz', nullable: true })
  activated_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}

/* ------------------------------ Users ------------------------------------- */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  // HMAC-SHA256 of lowercased email — enables O(1) lookup without decrypting all rows
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, name: 'email_hash', nullable: true })
  email_hash: string | null;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  password_hash: string;

  @Column({ type: 'uuid', name: 'license_id', nullable: true })
  license_id: string | null;

  @OneToOne(() => License)
  @JoinColumn({ name: 'license_id' })
  license: License | null;

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}

/* ----------------------------- Templates ---------------------------------- */
@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  asset_type: string;

  @Column({ type: 'text', name: 'prompt_template' })
  prompt_template: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Index()
  @Column({ type: 'boolean', name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}

/* ---------------------------- Campaigns ----------------------------------- */
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 255, name: 'product_name' })
  product_name: string;

  @Column({ type: 'varchar', length: 500, name: 'product_url', nullable: true })
  product_url: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  niche: string | null;

  @Column({ type: 'varchar', length: 50, default: 'professional' })
  tone: string;

  @Column({ type: 'varchar', length: 255, name: 'target_audience', nullable: true })
  target_audience: string | null;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: string; // draft / generating / generated / exported / failed

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}

/* ------------------------- GeneratedAssets -------------------------------- */
@Entity('generated_assets')
export class GeneratedAsset {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ type: 'uuid', name: 'campaign_id' })
  campaign_id: string;

  @ManyToOne(() => Campaign, (c) => c.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Index()
  @Column({ type: 'varchar', length: 50, name: 'asset_type' })
  asset_type: string; // review / bonus / email_sequence / social_posts / cta

  @Column({ type: 'varchar', length: 20, name: 'content_format' })
  content_format: string; // html / json / text

  // Stored as TEXT (TEXT/JSONB per blueprint). JSON payloads are serialized.
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'boolean', name: 'is_manual_edit', default: false })
  is_manual_edit: boolean;

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}

/* ------------------------------ Exports ----------------------------------- */
@Entity('exports')
export class Export {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ type: 'uuid', name: 'campaign_id' })
  campaign_id: string;

  @ManyToOne(() => Campaign, (c) => c.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ type: 'jsonb', name: 'format_selection' })
  format_selection: Record<string, unknown>;

  @Column({ type: 'varchar', length: 500, name: 'storage_path' })
  storage_path: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string; // pending / completed / failed

  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}

/* --------------------------- RevokedTokens -------------------------------- */
@Entity('revoked_tokens')
@Index(['jti'])
export class RevokedToken {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  jti: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expires_at: Date;
}
