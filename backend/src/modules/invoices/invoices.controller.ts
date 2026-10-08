// src/modules/invoices/invoices.controller.ts
// SADECE HTTP: DTO + yetki dekoratörleri + servis çağrısı.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly pdfService: InvoicePdfService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.INVOICE.READ)
  @ApiOperation({
    summary: 'Fatura listele (finansal alanlar izne göre maskeli)',
  })
  findAll(
    @Query() q: QueryInvoiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invoicesService.findAll(q, actor);
  }

  @Get(':id/pdf')
  @Permissions(PERMISSIONS.INVOICE.READ)
  @ApiOperation({ summary: 'Télécharger la facture en PDF' })
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: any,
  ) {
    const inv = (await this.invoicesService.findOne(id, actor)) as Record<string, any>;
    const doc = this.pdfService.build({
      number: inv.number ?? null,
      status: String(inv.status),
      customerName: inv.customerName,
      customerEmail: inv.customerEmail ?? null,
      currency: inv.currency,
      subtotal: Number(inv.subtotal ?? 0),
      taxRate: Number(inv.taxRate ?? 0),
      taxAmount: Number(inv.taxAmount ?? 0),
      total: Number(inv.total ?? 0),
      amountPaid: Number(inv.amountPaid ?? 0),
      issuedAt: inv.issuedAt ?? null,
      dueAt: inv.dueAt ?? null,
      createdAt: inv.createdAt,
      lineItems: ((inv.lineItems ?? []) as any[]).map((li) => ({
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        lineTotal: Number(li.lineTotal),
      })),
    });

    const filename = `facture-${inv.number ?? id.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVOICE.READ)
  @ApiOperation({
    summary: 'Fatura detayı (tutarlar invoice.read_financial ile)',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invoicesService.findOne(id, actor);
  }

  @Post()
  @Permissions(PERMISSIONS.INVOICE.CREATE)
  @ApiOperation({ summary: 'DRAFT fatura oluştur (sunucu hesabı)' })
  create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invoicesService.create(dto, actor);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.INVOICE.UPDATE)
  @ApiOperation({ summary: 'DRAFT fatura güncelle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invoicesService.update(id, dto, actor);
  }

  @Post(':id/issue')
  @Permissions(PERMISSIONS.INVOICE.UPDATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'DRAFT→SENT: sıralı numara üret' })
  issue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invoicesService.issue(id, actor);
  }

  @Post(':id/payments')
  @Permissions(PERMISSIONS.INVOICE.UPDATE, PERMISSIONS.INVOICE.READ_FINANCIAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ödeme kaydı (finansal)' })
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invoicesService.addPayment(id, dto, actor);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.INVOICE.UPDATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Koşullu iptal (PAID/ödenmiş iptal edilemez)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.invoicesService.cancel(id, actor);
  }
}
