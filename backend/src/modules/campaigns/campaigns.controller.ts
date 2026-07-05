import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  Res,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateAssetDto, RegenerateDto, ListCampaignsQuery, ASSET_TYPES } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LicenseGuard } from '../../common/guards/license.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const VALID_ASSET_TYPES = new Set(ASSET_TYPES);

function validateAssetType(assetType: string): void {
  if (!VALID_ASSET_TYPES.has(assetType as any)) {
    throw new BadRequestException({
      code: 'INVALID_ASSET_TYPE',
      message: `asset_type must be one of: ${[...VALID_ASSET_TYPES].join(', ')}`,
    });
  }
}

@Controller('campaigns')
@UseGuards(JwtAuthGuard, LicenseGuard)
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly config: ConfigService,
  ) {}

  @Get('ai-provider')
  getAiProvider() {
    // Only expose what the frontend needs — no infra internals
    const provider = this.config.get<string>('AI_PROVIDER') ?? 'anthropic';
    const modelMap: Record<string, string> = {
      openai:    this.config.get<string>('OPENAI_MODEL')  ?? 'gpt-4o',
      gemini:    this.config.get<string>('GEMINI_MODEL')  ?? 'gemini-2.0-flash',
      groq:      this.config.get<string>('GROQ_MODEL')    ?? 'llama-3.3-70b-versatile',
      anthropic: 'claude-3-5-sonnet',
    };
    return { provider, model: modelMap[provider] ?? 'unknown' };
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(user.id, dto);
  }

  @Get()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCampaignsQuery) {
    return this.campaigns.list(user.id, query);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return { campaign: await this.campaigns.getOne(user.id, id) };
  }

  @Get(':id/assets')
  async getAssets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.campaigns.getAssets(user.id, id);
  }

  @Post(':id/duplicate')
  async duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.campaigns.duplicate(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() res: Response,
  ) {
    await this.campaigns.remove(user.id, id);
    return res.status(204).send();
  }

  @Patch(':id/assets/:asset_type')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('asset_type') assetType: string,
    @Body() dto: UpdateAssetDto,
  ) {
    validateAssetType(assetType);
    return this.campaigns.updateAsset(user.id, id, assetType, dto.content);
  }

  @Post(':id/assets/:asset_type/regenerate')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('asset_type') assetType: string,
    @Body() dto: RegenerateDto,
  ) {
    validateAssetType(assetType);
    return this.campaigns.regenerate(user.id, id, assetType, dto.custom_instruction);
  }
}
