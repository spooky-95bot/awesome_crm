// src/modules/payments/payments.controller.ts
// SADECE HTTP: iyzico ödeme başlatma + niyet listesi. Fatura tahsilatı finansal işlem →
// invoice.update + invoice.read_financial (AND) gerekir.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('invoices')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post(':id/pay/iyzico')
  @Permissions(PERMISSIONS.INVOICE.UPDATE, PERMISSIONS.INVOICE.READ_FINANCIAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'iyzico ödeme formu başlat (checkout form)' })
  initiate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const fwd = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0])?.trim() ||
      req.ip ||
      '85.34.78.112';
    return this.service.initiate(id, dto, actor, ip);
  }

  @Get(':id/pay/iyzico/intents')
  @Permissions(PERMISSIONS.INVOICE.READ, PERMISSIONS.INVOICE.READ_FINANCIAL)
  @ApiOperation({ summary: 'Faturanın ödeme niyetleri (durum geçmişi)' })
  intents(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listIntents(id);
  }
}
