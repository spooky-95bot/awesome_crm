// src/modules/brands/dto/brand.dto.ts — Marka (marka radarı) DTO'ları.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const PRICE_BANDS = ['budget', 'mid', 'premium', 'luxury'];

export class CreateBrandDto {
  @ApiProperty({ example: 'Sokak Co.' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Giyim' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sector?: string;

  @ApiPropertyOptional({ example: 'Erkek sokak giyimi' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  niche?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '18-30 yaş erkek, şehirli' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  targetAudience?: string;

  @ApiPropertyOptional({ enum: PRICE_BANDS })
  @IsOptional()
  @IsIn(PRICE_BANDS)
  priceBand?: string;

  @ApiPropertyOptional({ type: [String], example: ['TR', 'DE'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  markets?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Bilinen rakip marka adları',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  knownCompetitors?: string[];
}

export class UpdateBrandDto extends CreateBrandDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  declare name: string;
}

export class QueryBrandDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
