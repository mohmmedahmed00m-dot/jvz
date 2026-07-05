import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EXPORT_QUEUE } from './export.service';
import { ExportPackagerService } from './export-packager.service';
import { ExportService } from './export.service';

interface ExportJobData {
  exportId: string;
  campaignId: string;
  formats: string[];
  bundle_as_zip: boolean;
}

/**
 * BullMQ processor for async export packaging (Section 5 queue recommendation).
 * Runs in-process; picks up export jobs and packages assets into storage.
 */
@Processor(EXPORT_QUEUE, { concurrency: 4 })
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger('ExportProcessor');

  constructor(
    private readonly packager: ExportPackagerService,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  async process(job: Job<ExportJobData>): Promise<void> {
    const { exportId, campaignId, formats, bundle_as_zip } = job.data;
    this.logger.log(`Processing export job ${exportId}`);
    
    // Add timeout (5 minutes max per job)
    const TIMEOUT_MS = 5 * 60 * 1000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Export job ${exportId} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
    });
    
    try {
      const packagePromise = this.packager.package(exportId, campaignId, { formats, bundle_as_zip });
      const { storage_path } = await Promise.race([packagePromise, timeoutPromise]);
      await this.exportService.markCompleted(exportId, storage_path);
    } catch (err) {
      this.logger.error(`Export job ${exportId} failed: ${(err as Error).message}`);
      await this.exportService.markFailed(exportId, (err as Error).message);
      throw err;
    }
  }
}
