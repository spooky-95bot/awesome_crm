// src/modules/payments/payments.public.controller.ts
// PUBLIC (bilinçli @Public): iyzico ödeme sonrası tarayıcı redirect'i (application/x-www-form-urlencoded).
// İMZASIZ — token gövdeye güvenilmeden sunucu-sunucu retrieve ile doğrulanır (service).
// Sonuçta kullanıcı frontend fatura sayfasına 302 ile geri gönderilir (?payment=success|failed).
import {
  Controller,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('payments-public')
@Controller('webhooks/iyzico')
export class PaymentsPublicController {
  constructor(
    private readonly service: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('callback')
  @ApiOperation({
    summary: 'iyzico ödeme callback (token → sunucu doğrulama → 302)',
  })
  async callback(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    // urlencoded gövde; body-parser boş kalırsa ham gövdeden çöz.
    const body = (req.body ?? {}) as { token?: string };
    let token = body.token ?? '';
    if (!token && req.rawBody) {
      token = new URLSearchParams(req.rawBody.toString()).get('token') ?? '';
    }
    const result = await this.service.handleCallback(token);
    const base = (
      this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    const target = result.invoiceId
      ? `${base}/invoices?payment=${result.status}&invoice=${result.invoiceId}`
      : `${base}/invoices?payment=failed`;
    res.redirect(HttpStatus.FOUND, target);
  }
}
