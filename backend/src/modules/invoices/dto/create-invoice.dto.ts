// src/modules/invoices/dto/create-invoice.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Pozitif ondalık (negatif/harf reddi → S-4.3). Manipüle quantity/price engeli.
const POSITIVE_DECIMAL = /^\d{1,12}(\.\d{1,3})?$/;

export class LineItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  description: string;

  @ApiProperty({ example: '2' })
  @Matches(POSITIVE_DECIMAL, { message: 'quantity pozitif bir sayı olmalı.' })
  quantity: string;

  @ApiProperty({ example: '1500.00' })
  @Matches(POSITIVE_DECIMAL, { message: 'unitPrice pozitif bir sayı olmalı.' })
  unitPrice: string;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  dealId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  customerName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  // KDV oranı (% — örn "20"). 0–100 aralığı Service'te doğrulanır.
  @ApiProperty({ example: '20' })
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, { message: 'taxRate 0–100 arası olmalı.' })
  taxRate: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: [LineItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];
}
