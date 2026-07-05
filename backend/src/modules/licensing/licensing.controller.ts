import { Controller, Post, Req, Res, HttpCode, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { LicensingService } from './licensing.service';

/**
 * JVZoo Instant Notification Service (INS) webhook (Section 6.1 / 8.5).
 * Receives form-encoded POST callbacks on purchase/refund/chargeback events.
 * No auth guard — protected by the cverify signature check instead.
 */
@Controller('webhooks/jvzoo')
export class LicensingController {
  constructor(
    private readonly licensing: LicensingService,
    private readonly config: ConfigService,
  ) {}

  @Post('ipn')
  @HttpCode(200)
  async jvzooIpn(@Req() req: Request, @Res() res: Response) {
    // JVZoo sends application/x-www-form-urlencoded — express urlencoded parser
    // puts the fields into req.body.
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      payload[k] = String(v);
    }

    const secret = this.config.get<string>('JVZOO_SECRET_KEY')!;
    if (!this.licensing.verifyJvzooSignature(payload, secret)) {
      throw new BadRequestException({ code: 'INVALID_SIGNATURE', message: 'JVZoo signature invalid' });
    }

    await this.licensing.handleJvzooIpn(payload);
    // JVZoo spec expects a 200 with a plain-text body.
    return res.type('text/plain').send('OK');
  }
}
