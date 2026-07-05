import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';

/**
 * Verifies the Access Token from the `Authorization: Bearer <token>` header.
 * Returns 401 on missing/expired/invalid token (per Section 6.4 middleware order).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T = any>(err: any, user: any, info: any): T {
    if (err || !user) {
      let message = 'Unauthorized';
      if (info instanceof TokenExpiredError) message = 'Access token expired';
      else if (info instanceof JsonWebTokenError) message = 'Invalid access token';
      throw Object.assign(new Error(message), { status: 401 });
    }
    return user;
  }
}
