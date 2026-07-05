import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
  MinLength,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

export const TONES = ['professional', 'casual', 'hype', 'trust-based'] as const;
export const ASSET_TYPES = ['review', 'bonus', 'email_sequence', 'social_posts', 'cta'] as const;
export const CAMPAIGN_STATUSES = ['draft', 'generating', 'generated', 'exported', 'failed'] as const;
type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  product_name: string;

  @IsOptional()
  @IsUrl({}, { message: 'product_url must be a valid URL' })
  @MaxLength(500)
  product_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  niche?: string;

  @IsEnum(TONES)
  tone: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  target_audience?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ASSET_TYPES, { each: true })
  generators_selected?: string[];
}

export class UpdateAssetDto {
  @IsString()
  @MaxLength(500_000, { message: 'Asset content must not exceed 500KB' })
  content: string;
}

export class RegenerateDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000, { message: 'Custom instruction must not exceed 2000 characters' })
  custom_instruction?: string;
}

export class ListCampaignsQuery {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional()
  @IsEnum(CAMPAIGN_STATUSES, { message: `status must be one of: ${CAMPAIGN_STATUSES.join(', ')}` })
  status?: CampaignStatus;
  @IsOptional() @IsDateString() date_from?: string;
  @IsOptional() @IsDateString() date_to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
