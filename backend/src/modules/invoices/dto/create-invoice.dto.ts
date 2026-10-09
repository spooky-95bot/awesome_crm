// src/modules/invoices/dto/create-invoice.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Décimal positif (rejet des négatifs/lettres → S-4.3). Empêche la manipulation de quantity/price.
const POSITIVE_DECIMAL = /^\d{1,12}(\.\d{1,3})?$/;

export class LineItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  description: string;

  @ApiProperty({ example: '2' })
  @Matches(POSITIVE_DECIMAL, { message: 'quantity doit être un nombre positif.' })
  quantity: string;

  @ApiProperty({ example: '1500.00' })
  @Matches(POSITIVE_DECIMAL, { message: 'unitPrice doit être un nombre positif.' })
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

  // Taux de TVA (% — ex. "20"). La plage 0–100 est validée par le service.
  @ApiProperty({ example: '20' })
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, { message: 'taxRate doit être compris entre 0 et 100.' })
  taxRate: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  // true = les prix unitaires sont TTC (tarifs affichés). La TVA est alors
  // extraite du montant, et non ajoutée. Défaut : false (prix HT).
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @ApiProperty({ type: [LineItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];
}
