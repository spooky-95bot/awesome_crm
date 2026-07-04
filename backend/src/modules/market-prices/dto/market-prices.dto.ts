// src/modules/market-prices/dto/market-prices.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ImportPricesDto {
  // CSV: başlık `name,price,currency,url` (ilk satır başlık). Uyumlu veri girişi (kazıma değil).
  @ApiProperty({ description: 'CSV içeriği (başlık: name,price,currency,url)' })
  @IsString()
  @MinLength(3)
  @MaxLength(200_000)
  csv: string;
}
