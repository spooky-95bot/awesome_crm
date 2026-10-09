// src/modules/invoices/dto/create-payment.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const PAYMENT_METHODS = ['BANK', 'CARD', 'CASH'] as const;

export class CreatePaymentDto {
  @ApiProperty({ example: '500.00' })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, { message: 'amount doit être positif.' })
  amount: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
