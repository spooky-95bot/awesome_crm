// src/modules/invoices/dto/update-invoice.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LineItemDto } from './create-invoice.dto';

// Valable uniquement sur une facture DRAFT (immuabilité imposée par le service).
export class UpdateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ example: '20' })
  @IsOptional()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, { message: 'taxRate doit être compris entre 0 et 100.' })
  taxRate?: string;

  @ApiPropertyOptional({ type: [LineItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];
}
