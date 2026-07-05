import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, ActivateLicenseDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'alk_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: isProd, // Section 6.4: Secure in prod; relaxed only for local HTTP dev
      sameSite: 'strict',
      // Path must match the API prefix so the browser sends the cookie on
      // /api/auth/refresh and /api/auth/logout (global prefix is 'api').
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })   // 5 attempts per minute
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto.email, dto.password);
    this.setRefreshCookie(res, result.refreshToken);
    return { user_id: result.user.id, access_token: result.accessToken };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })   // 5 attempts per minute — brute-force protection
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    this.setRefreshCookie(res, result.refreshToken);
    return {
      user_id: result.user.id,
      access_token: result.accessToken,
      license_status: result.licenseStatus,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })  // generous but bounded — prevents token-stuffing
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const result = await this.auth.refresh(token);
    return { access_token: result.accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    await this.auth.logout(token);
    this.clearRefreshCookie(res);
    res.status(204);
    return;
  }

  @Post('activate-license')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async activateLicense(
    @Body() dto: ActivateLicenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return await this.auth.activateLicense(user.id, dto.license_key);
  }
}
