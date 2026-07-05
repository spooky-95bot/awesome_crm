// src/modules/lead-forms/dto/lead-form.dto.ts — Lead intake form DTO'ları.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LeadChannel } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// Embed formda gösterilecek tek bir alanın tanımı.
export class FormFieldDto {
  @ApiProperty({ example: 'firstName' })
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, {
    message: 'key harf ile başlamalı (a-z0-9_), 1-40 karakter',
  })
  key: string;

  @ApiProperty({ example: 'Ad' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({
    enum: ['text', 'email', 'tel', 'phone', 'textarea', 'number'],
    description: '"phone" = uluslararası telefon (ülke kodu + E.164)',
  })
  @IsOptional()
  @IsEnum(['text', 'email', 'tel', 'phone', 'textarea', 'number'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  // --- Alan ayarları (v4.7): placeholder, yardım metni, sınırlar, özel hata mesajı ---

  @ApiPropertyOptional({ description: 'Girdi placeholder metni' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string;

  @ApiPropertyOptional({ description: 'Alanın altında görünen yardım metni' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpText?: string;

  @ApiPropertyOptional({ description: 'Sayısal alan için en küçük değer' })
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiPropertyOptional({ description: 'Sayısal alan için en büyük değer' })
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional({ description: 'En az karakter sayısı' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  minLength?: number;

  @ApiPropertyOptional({ description: 'En fazla karakter sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxLength?: number;

  @ApiPropertyOptional({ description: 'Özel doğrulama regex deseni' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pattern?: string;

  @ApiPropertyOptional({
    description: 'Doğrulama başarısızsa gösterilecek özel uyarı mesajı',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  errorMessage?: string;

  @ApiPropertyOptional({
    description: 'phone tipi için varsayılan ülke (ISO2, ör. TR)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'defaultCountry ISO2 olmalı (ör. TR)' })
  defaultCountry?: string;
}

export class CreateLeadFormDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ type: [FormFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @ApiPropertyOptional({ example: '#4f46e5' })
  @IsOptional()
  @IsHexColor()
  buttonColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  buttonLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  successMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  redirectUrl?: string;
}

export class UpdateLeadFormDto extends CreateLeadFormDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  declare name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryLeadFormDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

// Public submit / webhook ingest gövdesi — serbest anahtar→değer (form alanlarına göre).
// Bilinen lead alanları çıkarılır; gerisi meta'ya yazılır. Validasyon servis katmanında.
export class IntakePayloadDto {
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
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
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

  // Form-özel ekstra alanlar (meta'ya yazılır).
  [key: string]: unknown;
}

export { LeadChannel };
