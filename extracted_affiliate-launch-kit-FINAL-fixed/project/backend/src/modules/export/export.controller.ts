import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { IsArray, IsBoolean, IsOptional, IsString, IsEnum } from 'class-validator';
import { ExportService } from './export.service';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LicenseGuard } from '../../common/guards/license.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

// Valid export format identifiers — kept in sync with ExportPackagerService
const EXPORT_FORMATS = ['review', 'bonus', 'emails', 'social', 'cta'] as const;
type ExportFormat = typeof EXPORT_FORMATS[number];

class ExportDto {
  @IsOptional()
  @IsArray()
  @IsEnum(EXPORT_FORMATS, { each: true, message: `Each format must be one of: ${EXPORT_FORMATS.join(', ')}` })
  formats?: ExportFormat[];

  @IsBoolean({ message: 'bundle_as_zip must be a boolean value' })
  bundle_as_zip: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard, LicenseGuard)
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly storage: StorageService,
  ) {}

  @Post('campaigns/:id/export')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
  async createExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ExportDto,
  ) {
    const formats = dto.formats && dto.formats.length
      ? dto.formats
      : [...EXPORT_FORMATS];
    return this.exports.createExport(user.id, id, { formats, bundle_as_zip: dto.bundle_as_zip });
  }

  @Get('campaigns/:id/exports')
  async listExports(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.exports.listExports(user.id, id);
  }

  @Get('exports/:id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() res: Response,
  ) {
    const exportRec = await this.exports.getDownload(user.id, id);
    const buffer = await this.storage.readBuffer(exportRec.storage_path);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${exportRec.campaign_id}.zip"`);
    res.send(buffer);
  }
}
