// src/modules/payments/dto/initiate-payment.dto.ts
// iyzico ödeme başlatma — tüm alanlar opsiyonel (fatura müşteri bilgisinden türetilir).
// Verilirse iyzico buyer/adres bilgilerini zenginleştirir (kurumsal kayıt için).
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class InitiatePaymentDto {
  @ApiPropertyOptional({ example: 'Ahmet Yılmaz' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  buyerName?: string;

  @ApiPropertyOptional({ example: 'ahmet@ornek.com' })
  @IsOptional()
  @IsEmail()
  buyerEmail?: string;

  @ApiPropertyOptional({
    example: '11111111111',
    description: 'TC kimlik (11 hane)',
  })
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'identityNumber 11 haneli olmalı.' })
  identityNumber?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'France' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({ example: 'Örnek Mah. No:1' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}
