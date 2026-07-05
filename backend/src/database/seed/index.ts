import dataSource from '../data-source';
import { Template, License } from '../entities';
import { PROMPT_TEMPLATES } from '../../modules/generators/ai-engine/prompt-templates';
import { ALL_ASSET_TYPES, AssetType } from '../../modules/generators/generators.types';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { HashService } from '../../common/crypto/hash.service';
import { ConfigService } from '@nestjs/config';
import configuration from '../../config/configuration';

async function main() {
  await dataSource.initialize();
  const templateRepo = dataSource.getRepository(Template);
  const licenseRepo = dataSource.getRepository(License);

  const config = new ConfigService(configuration());
  const encryption = new EncryptionService(config);
  const hashService = new HashService(config);

  // Seed prompt templates
  for (const assetType of ALL_ASSET_TYPES) {
    const tpl = PROMPT_TEMPLATES[assetType as AssetType];
    const combined = `${tpl.system} ||| ${tpl.user}`;
    const existing = await templateRepo.findOne({ where: { asset_type: assetType, is_active: true } });
    if (existing) {
      existing.prompt_template = combined;
      existing.version = existing.version + 1;
      await templateRepo.save(existing);
      console.log(`[seed] updated template for ${assetType}`);
    } else {
      await templateRepo.save(
        templateRepo.create({
          asset_type: assetType,
          prompt_template: combined,
          version: 1,
          is_active: true,
        }),
      );
      console.log(`[seed] created template for ${assetType}`);
    }
  }

  // Seed test license (with hash for O(1) lookup)
  const testKey = 'ALK-DEMO-TEST-0001-0001';
  const encryptedKey = encryption.encrypt(testKey);
  const keyHash = hashService.hash(testKey);

  const allLicenses = await licenseRepo.find();
  const existing = allLicenses.find((l) => {
    if (l.license_key === testKey) return true;
    try {
      return encryption.decrypt(l.license_key) === testKey;
    } catch {
      return false;
    }
  });

  if (!existing) {
    const license = licenseRepo.create({
      license_key: encryptedKey,
      license_key_hash: keyHash,
      source: 'jvzoo',
      jvzoo_transaction_id: 'JVZ-TEST-0001',
      status: 'active',
    });
    await licenseRepo.save(license);
    console.log(`[seed] created test license ${testKey} (encrypted + hashed)`);
  } else {
    let changed = false;
    if (!encryption.isEncrypted(existing.license_key)) {
      existing.license_key = encryptedKey;
      changed = true;
    }
    if (!existing.license_key_hash) {
      existing.license_key_hash = keyHash;
      changed = true;
    }
    if (changed) {
      await licenseRepo.save(existing);
      console.log(`[seed] migrated test license ${testKey} (added encryption/hash)`);
    } else {
      console.log(`[seed] test license ${testKey} already up-to-date`);
    }
  }

  await dataSource.destroy();
  console.log('[seed] done');
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
