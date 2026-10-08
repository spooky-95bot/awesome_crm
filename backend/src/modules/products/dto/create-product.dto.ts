// src/modules/products/dto/create-product.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiPropertyOptional({ description: 'Stok kodu (benzersiz)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Para alanları string (Decimal hassasiyeti; float yok).
  @ApiProperty({ description: 'Birim fiyat (Decimal string)' })
  @IsNumberString()
  unitPrice: string;

  @ApiPropertyOptional({ default: 'EUR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: '% KDV', default: '0' })
  @IsOptional()
  @IsNumberString()
  taxRate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
