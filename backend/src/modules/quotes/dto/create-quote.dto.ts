// src/modules/quotes/dto/create-quote.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateQuoteLineItemDto {
  // productId verilirse açıklama/fiyat üründen alınabilir (CPQ).
  @ApiPropertyOptional({ description: 'Katalog ürünü (opsiyonel)' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ description: 'productId yoksa zorunlu' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Miktar (Decimal string)' })
  @IsNumberString()
  quantity: string;

  @ApiPropertyOptional({ description: 'Birim fiyat (yoksa üründen alınır)' })
  @IsOptional()
  @IsNumberString()
  unitPrice?: string;
}

export class CreateQuoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  dealId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  customerName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerEmail?: string;

  @ApiPropertyOptional({ default: 'EUR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ description: '% KDV (0–100)' })
  @IsNumberString()
  taxRate: string;

  @ApiPropertyOptional({ description: 'Geçerlilik bitişi (ISO)' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({ type: [CreateQuoteLineItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteLineItemDto)
  lineItems: CreateQuoteLineItemDto[];
}
