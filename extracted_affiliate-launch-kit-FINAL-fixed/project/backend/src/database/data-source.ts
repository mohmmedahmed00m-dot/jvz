import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  User,
  Campaign,
  GeneratedAsset,
  Template,
  License,
  Export,
  RevokedToken,
} from './entities';

// Load .env for CLI usage (migration:run / seed run outside Nest bootstrap).
config({ path: resolve(process.cwd(), '.env') });

const databaseUrl = process.env.DATABASE_URL!;

/**
 * TypeORM DataSource used by the CLI (`npm run migration:run`) and seed scripts.
 * In-app connections are created by TypeOrmModule.forRootAsync in AppModule,
 * but they share these same entities + migrations configuration.
 */
const dataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [User, Campaign, GeneratedAsset, Template, License, Export, RevokedToken],
  migrations: [resolve(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: false,
});

export default dataSource;
