// src/modules/deals/dto/create-deal.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDealDto {
  @ApiProperty()
  @IsUUID('4')
  pipelineId: string;

  @ApiProperty()
  @IsUUID('4')
  stageId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  // Parasal değer string olarak alınır → Service'te Decimal'e çevrilir (float yok).
  @ApiPropertyOptional({ example: '12000.50' })
  @IsOptional()
  @IsNumberString()
  value?: string;

  @ApiPropertyOptional({ example: 'EUR', default: 'EUR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  // v2.5 — tanımlı özel alanlar (Service'te doğrulanır).
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
