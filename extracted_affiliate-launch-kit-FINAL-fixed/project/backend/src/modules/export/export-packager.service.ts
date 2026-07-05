import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import archiver from 'archiver';
import { GeneratedAsset, Export } from '../../database/entities';
import { StorageService } from './storage.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

export interface ExportRequest {
  formats: string[]; // review | bonus | emails | social | cta
  bundle_as_zip: boolean;
}

interface BuiltFile {
  name: string;
  content: string;
}

/**
 * Builds export files from a campaign's generated assets and packages them
 * (ZIP when bundle_as_zip). This is the queue-ready packaging unit (Section 3.0
 * mentions a queue-ready interface; Section 5 recommends BullMQ for export).
 */
@Injectable()
export class ExportPackagerService {
  private readonly logger = new Logger('ExportPackager');

  constructor(
    @InjectRepository(GeneratedAsset) private readonly assetRepo: Repository<GeneratedAsset>,
    private readonly storage: StorageService,
    private readonly encryption: EncryptionService,
  ) {}

  async package(exportId: string, campaignId: string, req: ExportRequest): Promise<{ storage_path: string }> {
    const assets = await this.assetRepo.find({ where: { campaign_id: campaignId } });
    if (!assets.length) {
      throw new NotFoundException({ code: 'NO_ASSETS', message: 'No assets to export' });
    }
    // Decrypt content from AES-256-GCM before packaging
    for (const a of assets) {
      if (a.content) {
        a.content = this.encryption.decrypt(a.content);
      }
    }
    const byType = new Map(assets.map((a) => [a.asset_type, a]));

    const requested = req.formats && req.formats.length ? req.formats : ['review', 'bonus', 'emails', 'social', 'cta'];
    const files: BuiltFile[] = [];

    if (requested.includes('review') && byType.has('review')) {
      files.push({ name: 'review.html', content: this.wrapHtml('Review Page', byType.get('review')!.content) });
    }
    if (requested.includes('bonus') && byType.has('bonus')) {
      files.push({ name: 'bonus.html', content: this.wrapHtml('Bonus Page', byType.get('bonus')!.content) });
    }
    if (requested.includes('emails') && byType.has('email_sequence')) {
      const raw = byType.get('email_sequence')!.content;
      files.push({ name: 'emails.json', content: this.prettyJson(raw) });
      files.push({ name: 'emails.txt', content: this.emailsToText(raw) });
    }
    if (requested.includes('social') && byType.has('social_posts')) {
      const raw = byType.get('social_posts')!.content;
      files.push({ name: 'social.json', content: this.prettyJson(raw) });
      files.push({ name: 'social.txt', content: this.socialToText(raw) });
    }
    if (requested.includes('cta') && byType.has('cta')) {
      const raw = byType.get('cta')!.content;
      files.push({ name: 'cta.json', content: this.prettyJson(raw) });
      files.push({ name: 'cta.txt', content: this.ctaToText(raw) });
    }

    if (!files.length) {
      throw new NotFoundException({ code: 'NO_MATCHING_ASSETS', message: 'No matching assets for selected formats' });
    }

    const key = `exports/${campaignId}/${exportId}.zip`;
    const buffer = await this.buildZip(files);
    const storagePath = await this.storage.upload(key, buffer);
    this.logger.log(`Packaged ${files.length} files into ${key} (${buffer.length} bytes)`);
    return { storage_path: storagePath };
  }

  private async buildZip(files: BuiltFile[]): Promise<Buffer> {
    return new Promise((resolveP, rejectP) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolveP(Buffer.concat(chunks)));
      archive.on('error', rejectP);
      for (const f of files) {
        archive.append(f.content, { name: f.name });
      }
      // Also include a README manifest
      archive.append(
        files.map((f) => `- ${f.name}`).join('\n'),
        { name: 'MANIFEST.txt' },
      );
      archive.finalize();
    });
  }

  private wrapHtml(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:Inter,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#0f172a;line-height:1.6}
  .cta-block{background:#f1f5f9;padding:16px 20px;border-radius:8px;margin-top:24px}
  .cta-button{display:inline-block;background:#f59e0b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700}
  .bonus-card{border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0}
  .value-tag{display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:13px;font-weight:600}
</style>
</head>
<body>
${body}
</body>
</html>`;
  }

  private prettyJson(raw: string): string {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  private emailsToText(raw: string): string {
    try {
      const arr = JSON.parse(raw);
      return arr
        .map(
          (e: any) =>
            `EMAIL ${e.order}\nSubject: ${e.subject}\nPreheader: ${e.preheader}\nCTA: ${e.cta_text}\n\n${e.body}`,
        )
        .join('\n\n' + '='.repeat(50) + '\n\n');
    } catch {
      return raw;
    }
  }

  private socialToText(raw: string): string {
    try {
      const obj = JSON.parse(raw);
      const lines: string[] = [];
      for (const [platform, data] of Object.entries(obj)) {
        const d: any = data;
        lines.push(`===== ${platform.toUpperCase()} =====`);
        if (d.text) lines.push(d.text);
        if (d.caption) lines.push(d.caption);
        if (d.hashtags) lines.push(d.hashtags.map((h: string) => `#${h}`).join(' '));
        lines.push('');
      }
      return lines.join('\n');
    } catch {
      return raw;
    }
  }

  private ctaToText(raw: string): string {
    try {
      const arr = JSON.parse(raw);
      return arr
        .map(
          (c: any, i: number) =>
            `${i + 1}. [${c.urgency_level}] ${c.button_text}\n   (${c.placement_context}) ${c.supporting_line}`,
        )
        .join('\n\n');
    } catch {
      return raw;
    }
  }
}
