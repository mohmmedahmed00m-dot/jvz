import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { LicensingService } from '../../modules/licensing/licensing.service';

/**
 * Per-request license authorization (Section 6.3): requires an active license
 * associated with the authenticated user. Queries the LIVE database state so
 * a JVZoo refund revocation takes effect immediately (not from the stale JWT).
 * Returns 403 when the license is inactive/revoked/refunded or absent.
 *
 * Middleware order (Section 6.4): JWT verification (JwtAuthGuard) → this → handler.
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly licensingService: LicensingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenException({ code: 'NO_SESSION', message: 'Authentication required' });
    }
    const status = await this.licensingService.getUserLicenseStatus(user.id);
    if (status !== 'active') {
      throw new ForbiddenException({
        code: 'LICENSE_INACTIVE',
        message:
          'Your license is not active. Please activate a valid license key, or contact support if you believe this is an error.',
      });
    }
    // Refresh the live status onto the request for downstream use.
    request.user.license_status = status;
    return true;
  }
}
