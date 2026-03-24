import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsJSON, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ValidateUUID } from 'src/validation';

export class CreateDevelopHistoryDto {
  @IsString()
  @MaxLength(255)
  @IsOptional()
  @ApiPropertyOptional({ description: 'Human-readable label for this version (e.g. "Added vignette")' })
  label?: string;

  @IsObject()
  @ApiProperty({ description: 'Full develop state snapshot (from DevelopManager.serialize())' })
  state!: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Whether this is an auto-checkpoint (vs manual snapshot)', default: false })
  isAutoCheckpoint?: boolean;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Base64-encoded thumbnail JPEG (max 50KB)' })
  thumbnailBase64?: string;
}

export class DevelopHistoryResponseDto {
  @ValidateUUID()
  id!: string;

  @ValidateUUID()
  assetId!: string;

  @ValidateUUID()
  userId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  state!: Record<string, unknown>;

  @ApiProperty()
  isCurrent!: boolean;

  @ApiProperty()
  isAutoCheckpoint!: boolean;

  @ApiProperty()
  hasThumbnail!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class DevelopHistoryListResponseDto {
  @ValidateUUID()
  assetId!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: [DevelopHistoryResponseDto] })
  versions!: DevelopHistoryResponseDto[];
}

export class RestoreDevelopHistoryDto {
  @IsString()
  @MaxLength(255)
  @IsOptional()
  @ApiPropertyOptional({ description: 'Optional label for the new version created from the restore' })
  label?: string;
}
