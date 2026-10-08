// src/modules/ai/dto/ai.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const EMAIL_TONES = ['professional', 'friendly', 'formal'] as const;

export class DraftEmailDto {
  @ApiProperty({ description: 'E-postanın bağlamı/amacı (serbest metin)' })
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  context: string;

  @ApiPropertyOptional({ enum: EMAIL_TONES, default: 'professional' })
  @IsOptional()
  @IsIn(EMAIL_TONES)
  tone?: (typeof EMAIL_TONES)[number];

  @ApiPropertyOptional({ description: 'Langue de réponse', default: 'fr' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;
}

export class SummarizeDto {
  @ApiProperty({ description: 'Özetlenecek metin' })
  @IsString()
  @MinLength(3)
  @MaxLength(20000)
  text: string;
}
