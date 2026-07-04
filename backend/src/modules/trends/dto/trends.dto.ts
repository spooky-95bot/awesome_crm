// src/modules/trends/dto/trends.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class TrendsDto {
  // Boş bırakılırsa markanın anahtar kelimeleri (ilk 5) kullanılır. Google Trends max 5 terim.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({
    example: 'TR',
    description: 'ISO ülke kodu (boş = küresel)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  geo?: string;
}
