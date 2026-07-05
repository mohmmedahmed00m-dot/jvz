import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Express Request payload attached by the JwtStrategy. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  license_status: string; // active / revoked / refunded / none
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    return data ? user?.[data] : user;
  },
);
