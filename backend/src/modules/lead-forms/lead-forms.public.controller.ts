// src/modules/lead-forms/lead-forms.public.controller.ts
// Endpoints publics (exemptés du JwtAuthGuard global via @Public):
//   GET  /public/lead-forms/:publicKey         → embed render config (secret YOK)
//   POST /public/lead-forms/:publicKey/submit  → formulaire navigateur (non signé) → canal FORM
//   POST /webhooks/leads/:publicKey            → serveur-à-serveur (HMAC obligatoire) → canal WEBHOOK
// Note : submit autorise les champs non définis (champs spécifiques au formulaire) → corps brut au lieu du DTO,
// validation dans la couche service, corps brut écrit dans meta.
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { LeadFormsService } from './lead-forms.service';

@ApiTags('lead-forms-public')
@Controller()
export class LeadFormsPublicController {
  constructor(private readonly service: LeadFormsService) {}

  @Public()
  @Get('public/lead-forms/:publicKey')
  @ApiOperation({ summary: 'Configuration du formulaire embarqué (public)' })
  config(@Param('publicKey') publicKey: string) {
    return this.service.getPublicConfig(publicKey);
  }

  @Public()
  @Post('public/lead-forms/:publicKey/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public embed form submission (unsigned)' })
  submit(
    @Param('publicKey') publicKey: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.submit(publicKey, body ?? {});
  }

  @Public()
  @Post('webhooks/leads/:publicKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Réception de lead via webhook (signature HMAC obligatoire)',
  })
  webhook(
    @Param('publicKey') publicKey: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-crm-signature') signature?: string,
    @Headers('x-crm-timestamp') timestamp?: string,
  ) {
    return this.service.ingestWebhook({
      publicKey,
      rawBody: req.rawBody?.toString() ?? '',
      signature,
      timestamp,
    });
  }
}
