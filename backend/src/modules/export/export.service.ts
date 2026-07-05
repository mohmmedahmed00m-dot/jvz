import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Export, Campaign } from '../../database/entities';
import { ExportPackagerService, ExportRequest } from './export-packager.service';

export const EXPORT_QUEUE = 'export';

@Injectable()
export class ExportService {
  private readonly logger = new Logger('Export');

  constructor(
    @InjectRepository(Export) private readonly exportRepo: Repository<Export>,
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    private readonly packager: ExportPackagerService,
    @InjectQueue(EXPORT_QUEUE) private readonly queue: Queue,
  ) {}

  async createExport(userId: string, campaignId: string, req: ExportRequest) {
    // Ownership check
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });
    if (campaign.user_id !== userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your campaign' });

    const exportRec = this.exportRepo.create({
      campaign_id: campaignId,
      format_selection: { formats: req.formats, bundle_as_zip: req.bundle_as_zip },
      storage_path: '',
      status: 'pending',
    });
    await this.exportRepo.save(exportRec);

    // Enqueue async packaging job (Section 5: BullMQ for export jobs).
    await this.queue.add('package', {
      exportId: exportRec.id,
      campaignId,
      formats: req.formats,
      bundle_as_zip: req.bundle_as_zip,
    });
    this.logger.log(`Export ${exportRec.id} queued (pending)`);

    return { export_id: exportRec.id, status: 'pending' as const };
  }

  async listExports(userId: string, campaignId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });
    if (campaign.user_id !== userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your campaign' });
    const exports = await this.exportRepo.find({
      where: { campaign_id: campaignId },
      order: { created_at: 'DESC' },
    });
    return { exports };
  }

  async getDownload(userId: string, exportId: string) {
    const exportRec = await this.exportRepo.findOne({ where: { id: exportId } });
    if (!exportRec) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Export not found' });
    const campaign = await this.campaignRepo.findOne({ where: { id: exportRec.campaign_id } });
    if (!campaign || campaign.user_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your export' });
    }
    if (exportRec.status !== 'completed') {
      throw new NotFoundException({ code: 'NOT_READY', message: `Export is ${exportRec.status}` });
    }
    return exportRec;
  }

  /** Called by the BullMQ processor after packaging completes. */
  async markCompleted(exportId: string, storagePath: string) {
    await this.exportRepo.update(exportId, { storage_path: storagePath, status: 'completed' });
    this.logger.log(`Export ${exportId} completed -> ${storagePath}`);
  }

  async markFailed(exportId: string, reason: string) {
    await this.exportRepo.update(exportId, { status: 'failed' });
    this.logger.error(`Export ${exportId} failed: ${reason}`);
  }
}
