// src/modules/invoices/invoices.service.ts
// İŞ MANTIĞI: fatura yaşam döngüsü, sunucu-taraflı Decimal hesap, finansal maskeleme.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PERMISSIONS } from '../../common/constants/permission.enum';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { InvoicesRepository } from './invoices.repository';
import { calcTotals, deriveStatus } from './money.util';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

const D = Prisma.Decimal;
const DUE_DAYS = 14;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: { lineItems: true; payments: true };
}>;

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly repo: InvoicesRepository,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateInvoiceDto, actor: AuthenticatedUser) {
    this.assertTaxRate(dto.taxRate);
    const totals = calcTotals(dto.lineItems, dto.taxRate);

    const invoice = await this.repo.create(
      {
        dealId: dto.dealId,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        currency: dto.currency ?? 'EUR',
        subtotal: totals.subtotal,
        taxRate: dto.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        createdById: actor.id,
      },
      dto.lineItems.map((li, i) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        lineTotal: totals.lineTotals[i],
      })),
    );
    this.logger.log(`invoice.create by=${actor.id} invoice=${invoice.id}`);
    return this.toView(invoice, actor);
  }

  async findAll(q: QueryInvoiceDto, actor: AuthenticatedUser) {
    const where: Prisma.InvoiceWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.q) {
      where.OR = [
        { customerName: { contains: q.q, mode: 'insensitive' } },
        { number: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return {
      data: items.map((inv) => this.toView(inv, actor)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const invoice = await this.getOrThrow(id);
    return this.toView(invoice, actor);
  }

  async update(id: string, dto: UpdateInvoiceDto, actor: AuthenticatedUser) {
    const invoice = await this.getOrThrow(id);
    // Immutability: yalnız DRAFT düzenlenebilir.
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictException(
        'Yalnız DRAFT fatura düzenlenebilir (SENT+ değişmez).',
      );
    }
    const taxRate = dto.taxRate ?? invoice.taxRate.toString();
    this.assertTaxRate(taxRate);
    const lines = (dto.lineItems ?? invoice.lineItems).map((li) => ({
      description: li.description,
      quantity: li.quantity.toString(),
      unitPrice: li.unitPrice.toString(),
    }));
    const totals = calcTotals(lines, taxRate);

    const updated = await this.repo.replaceDraft(
      id,
      {
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        subtotal: totals.subtotal,
        taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
      },
      lines.map((li, i) => ({ ...li, lineTotal: totals.lineTotals[i] })),
    );
    return this.toView(updated, actor);
  }

  async issue(id: string, actor: AuthenticatedUser) {
    const invoice = await this.getOrThrow(id);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictException('Seule une facture au statut DRAFT peut être émise.');
    }
    if (invoice.lineItems.length === 0) {
      throw new BadRequestException('Une facture sans ligne ne peut pas être émise.');
    }
    // Sunucu UTC: yıl + vade.
    const year = new Date().getUTCFullYear();
    const dueAt = new Date(Date.now() + DUE_DAYS * 24 * 60 * 60 * 1000);
    const issued = await this.repo.issueWithNumber(id, year, dueAt);
    this.logger.log(
      `invoice.issue by=${actor.id} invoice=${id} number=${issued.number}`,
    );
    this.events.emit('invoice.issued', {
      invoiceId: id,
      number: issued.number,
    });
    return this.toView(issued, actor);
  }

  async addPayment(
    id: string,
    dto: CreatePaymentDto,
    actor: AuthenticatedUser,
  ) {
    const invoice = await this.getOrThrow(id);
    if (
      invoice.status === InvoiceStatus.DRAFT ||
      invoice.status === InvoiceStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Bu fatura durumunda ödeme kaydedilemez (DRAFT/CANCELLED).',
      );
    }
    const amount = new D(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Le montant du paiement doit être positif.');
    }
    const newAmountPaid = invoice.amountPaid.plus(amount);
    // Aşırı ödeme engeli.
    if (newAmountPaid.gt(invoice.total)) {
      throw new BadRequestException(
        'Ödeme toplam tutarı aşamaz (aşırı ödeme).',
      );
    }
    const status = deriveStatus(newAmountPaid, invoice.total);
    const updated = await this.repo.addPayment({
      invoiceId: id,
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      recordedById: actor.id,
      newAmountPaid,
      status,
    });
    this.logger.log(
      `invoice.payment by=${actor.id} invoice=${id} amount=${dto.amount} status=${status}`,
    );
    // Tam ödeme → invoice.paid olayı.
    if (status === InvoiceStatus.PAID) {
      this.events.emit('invoice.paid', {
        invoiceId: id,
        number: invoice.number,
        total: invoice.total.toString(),
      });
    }
    return this.toView(updated, actor);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const invoice = await this.getOrThrow(id);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new ConflictException('La facture est déjà annulée.');
    }
    // PAID veya ödeme alınmış fatura iptal edilemez → credit note ile düzeltilir.
    if (invoice.status === InvoiceStatus.PAID || invoice.amountPaid.gt(0)) {
      throw new ConflictException(
        'Ödeme alınmış/ödenmiş fatura iptal edilemez (credit note kullanın).',
      );
    }
    const cancelled = await this.repo.cancel(id);
    this.logger.log(`invoice.cancel by=${actor.id} invoice=${id}`);
    return this.toView(cancelled, actor);
  }

  // v4.6 — iyzico ödeme başlatma için anlık görüntü (kalan bakiye dahil). Repo erişimi
  // yalnız servis üstünden; ödeme modülü faturayı doğrudan okumaz.
  async paymentSnapshot(id: string) {
    const invoice = await this.getOrThrow(id);
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      currency: invoice.currency,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      remaining: invoice.total.minus(invoice.amountPaid),
    };
  }

  // v4.6 — Dış sağlayıcı (iyzico) ödemesini kaydeder. actor YOK (callback public);
  // recordedById çağıran taraftan (ödeme niyetini başlatan kullanıcı). addPayment ile
  // AYNI finansal güvenceler: pozitiflik, aşırı ödeme engeli, durum türetimi, invoice.paid.
  async applyExternalPayment(
    id: string,
    amount: string,
    opts: { method: string; reference: string; recordedById: string },
  ) {
    const invoice = await this.getOrThrow(id);
    if (
      invoice.status === InvoiceStatus.DRAFT ||
      invoice.status === InvoiceStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Bu fatura durumunda ödeme kaydedilemez (DRAFT/CANCELLED).',
      );
    }
    const amt = new D(amount);
    if (amt.lte(0)) {
      throw new BadRequestException('Le montant du paiement doit être positif.');
    }
    const newAmountPaid = invoice.amountPaid.plus(amt);
    if (newAmountPaid.gt(invoice.total)) {
      throw new BadRequestException(
        'Ödeme toplam tutarı aşamaz (aşırı ödeme).',
      );
    }
    const status = deriveStatus(newAmountPaid, invoice.total);
    const updated = await this.repo.addPayment({
      invoiceId: id,
      amount,
      method: opts.method,
      reference: opts.reference,
      recordedById: opts.recordedById,
      newAmountPaid,
      status,
    });
    this.logger.log(
      `invoice.payment.external invoice=${id} amount=${amount} status=${status}`,
    );
    if (status === InvoiceStatus.PAID) {
      this.events.emit('invoice.paid', {
        invoiceId: id,
        number: invoice.number,
        total: invoice.total.toString(),
      });
    }
    return updated;
  }

  // --- Yardımcılar ---

  private async getOrThrow(id: string): Promise<InvoiceWithRelations> {
    const invoice = await this.repo.findById(id);
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }
    return invoice;
  }

  private assertTaxRate(taxRate: string): void {
    const t = new D(taxRate);
    if (t.lt(0) || t.gt(100)) {
      throw new BadRequestException('taxRate doit être compris entre 0 et 100.');
    }
  }

  // Finansal maskeleme: invoice.read_financial yoksa tutar/kalem/ödeme API'de KESİLİR.
  private toView(invoice: InvoiceWithRelations, actor: AuthenticatedUser) {
    const base = {
      id: invoice.id,
      number: invoice.number,
      dealId: invoice.dealId,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      status: invoice.status,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
    const canFinancial = actor.permissions.includes(
      PERMISSIONS.INVOICE.READ_FINANCIAL,
    );
    if (!canFinancial) {
      return base;
    }
    return {
      ...base,
      subtotal: invoice.subtotal.toString(),
      taxRate: invoice.taxRate.toString(),
      taxAmount: invoice.taxAmount.toString(),
      total: invoice.total.toString(),
      amountPaid: invoice.amountPaid.toString(),
      lineItems: invoice.lineItems.map((li) => ({
        id: li.id,
        description: li.description,
        quantity: li.quantity.toString(),
        unitPrice: li.unitPrice.toString(),
        lineTotal: li.lineTotal.toString(),
      })),
      payments: invoice.payments.map((p) => ({
        id: p.id,
        amount: p.amount.toString(),
        method: p.method,
        reference: p.reference,
        paidAt: p.paidAt,
      })),
    };
  }
}
