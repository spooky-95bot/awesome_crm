// src/modules/integrations/dto/create-webhook.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';
import { SUPPORTED_EVENTS } from '../integration-events';

export class CreateWebhookDto {
  // HTTPS uniquement (SSRF + sécurité transport validés dans Service).
  @ApiProperty({ example: 'https://example.com/webhooks/crm' })
  @IsString()
  url: string;

  @ApiProperty({ enum: SUPPORTED_EVENTS, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SUPPORTED_EVENTS, { each: true })
  events: string[];
}
