import { EventSubscriber, EntitySubscriberInterface, UpdateEvent } from 'typeorm';
import { Logger } from '@nestjs/common';
import { License } from '../entities';

/**
 * TypeORM Subscriber that protects the `license_key` column from accidental
 * overwrite with plain-text values. Strips any unencrypted license_key from
 * UPDATE payloads before they reach the DB.
 */
@EventSubscriber()
export class LicenseKeyGuardSubscriber implements EntitySubscriberInterface<License> {
  private readonly logger = new Logger('LicenseKeyGuard');

  listenTo() {
    return License;
  }

  beforeUpdate(event: UpdateEvent<License>) {
    if (!event.entity) return;
    const key = event.entity.license_key;
    if (key && !key.startsWith('$aes256gcm$')) {
      // Never log the key value itself — only that blocking occurred
      this.logger.warn('Blocked plain-text license_key UPDATE — encrypted value preserved');
      delete event.entity.license_key;
    }
  }
}
