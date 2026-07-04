// src/modules/ad-radar/dto/ad-radar.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class SearchAdsDto {
  // Boş bırakılırsa markanın niş reklam-arama terimleri kullanılır.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  searchTerms?: string[];

  @ApiProperty({ example: 'TR', description: 'ISO ülke kodu' })
  @IsString()
  @Length(2, 2)
  country: string;

  @ApiPropertyOptional({ enum: ['ALL', 'ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'INACTIVE'])
  activeStatus?: string;
}

export class SaveAdDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  adArchiveId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pageName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  snapshotUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  startTime?: string;
}
