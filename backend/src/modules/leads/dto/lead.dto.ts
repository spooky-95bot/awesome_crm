// src/modules/leads/dto/lead.dto.ts — nitelenmemiş Lead DTO'ları.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LeadChannel, LeadStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// Dönüştürme sırasında oluşturulacak Deal/Contact için OPSİYONEL override'lar.
// Hiçbiri verilmezse lead verisi kullanılır (geriye dönük uyumlu).
export class ConvertLeadDto {
  @ApiPropertyOptional({ description: 'Deal başlığı (boşsa Ad Soyad)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ description: 'Tahmini değer (ondalık, ör. 12000.50)' })
  @IsOptional()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, { message: 'value geçerli tutar olmalı' })
  value?: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
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

  @ApiPropertyOptional({ description: 'Hedef stage (boşsa ilk stage)' })
  @IsOptional()
  @IsUUID()
  stageId?: string;
}

export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

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
  companyName?: string;

  @ApiPropertyOptional({ example: 'WEB' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

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
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  // Dönüştürme dışı durum güncellemeleri (NEW/WORKING/QUALIFIED/UNQUALIFIED).
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}

export class QueryLeadDto extends PaginationDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadChannel })
  @IsOptional()
  @IsEnum(LeadChannel)
  channel?: LeadChannel;

  @ApiPropertyOptional({ description: 'Kaynak form id (FORM kanalı filtresi)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  formId?: string;

  @ApiPropertyOptional({ description: 'Alt-kaynak (serbest metin) içerir' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
