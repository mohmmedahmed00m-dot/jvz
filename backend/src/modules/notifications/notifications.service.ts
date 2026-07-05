import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Transactional email service (Section 6.2).
 * Provider: Resend (resend.com)
 *
 * - When EMAIL_PROVIDER_API_KEY is set → sends real emails via Resend
 * - When missing (dev/test)           → logs to console only
 *
 * Used for: license key delivery after JVZoo sale.
 * NOT for: the Email Sequence Generator content (that's a product deliverable).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  private readonly resend: Resend | null = null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_API_KEY') ?? '';
    const isReal = !!apiKey && apiKey.startsWith('re_') && apiKey.length > 10;

    if (isReal) {
      this.resend = new Resend(apiKey);
      this.logger.log('Email provider: Resend (live)');
    } else {
      this.logger.warn('EMAIL_PROVIDER_API_KEY not set — emails will be logged to console only');
    }

    // The "from" address must be a verified domain in your Resend account.
    // Default uses Resend's shared sandbox domain for testing.
    this.fromAddress =
      this.config.get<string>('EMAIL_FROM_ADDRESS') ?? 'onboarding@resend.dev';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core send method
  // ─────────────────────────────────────────────────────────────────────────
  async send(to: string, subject: string, htmlBody: string, textBody?: string): Promise<void> {
    if (!this.resend) {
      // Dev/test fallback: log without sending
      this.logger.log(
        `[MOCK EMAIL]\nTo:      ${to}\nSubject: ${subject}\n${'─'.repeat(50)}\n${textBody ?? htmlBody}\n${'─'.repeat(50)}`,
      );
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject,
        html: htmlBody,
        ...(textBody ? { text: textBody } : {}),
      });

      if (error) {
        this.logger.error(`Resend error sending to ${to}: ${JSON.stringify(error)}`);
        // Don't throw — a failed license email shouldn't crash the IPN handler.
        // The license is already created in DB; support can resend manually.
      } else {
        this.logger.log(`Email sent → ${to} | subject: "${subject}"`);
      }
    } catch (err) {
      this.logger.error(`Resend exception: ${(err as Error).message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Specific email templates
  // ─────────────────────────────────────────────────────────────────────────
  async sendLicenseKey(to: string, licenseKey: string): Promise<void> {
    const baseUrl = this.config.get<string>('FRONTEND_BASE_URL') ?? 'http://localhost:5173';
    const activateUrl = `${baseUrl}/login`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your License Key</title>
</head>
<body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:40px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
              padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <h1 style="color:#0f172a;font-size:22px;margin:0 0 8px;">
      Welcome to Affiliate Launch Kit 🎉
    </h1>
    <p style="color:#64748b;margin:0 0 32px;font-size:15px;">
      Your purchase is confirmed. Here's your license key:
    </p>

    <div style="background:#f1f5f9;border-radius:8px;padding:20px;
                text-align:center;margin-bottom:32px;">
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;
                letter-spacing:0.05em;">License Key</p>
      <code style="font-size:20px;font-weight:700;color:#0f172a;
                   letter-spacing:0.1em;">${licenseKey}</code>
    </div>

    <a href="${activateUrl}"
       style="display:block;background:#f59e0b;color:#fff;text-align:center;
              padding:14px 24px;border-radius:8px;text-decoration:none;
              font-weight:700;font-size:16px;margin-bottom:24px;">
      Activate My License →
    </a>

    <p style="color:#94a3b8;font-size:13px;margin:0;">
      If you have any issues, reply to this email and we'll help you out.
    </p>
  </div>
</body>
</html>`.trim();

    const text = [
      'Welcome to Affiliate Launch Kit!',
      '',
      'Your license key:',
      `  ${licenseKey}`,
      '',
      `Activate here: ${activateUrl}`,
      '',
      'Reply to this email if you need help.',
    ].join('\n');

    await this.send(
      to,
      'Your Affiliate Launch Kit License Key',
      html,
      text,
    );
  }
}
