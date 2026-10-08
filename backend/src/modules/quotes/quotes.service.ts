// src/modules/quotes/quotes.service.ts
// İŞ MANTIĞI: Teklif (CPQ) yaşam döngüsü. Para hesabı sunucu-taraflı Decimal
// (money.util — float yok). convert → Invoice (DRAFT) tek transaction, idempotent.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { calcTotals } from '../invoices/money.util';
import { ProductsService } from '../products/products.service';
import { QuotesRepository } from './quotes.repository';
import { CreateQuoteDto, CreateQuoteLineItemDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';

const D = Prisma.Decimal;

type QuoteWithItems = Prisma.QuoteGetPayload<{ include: { lineItems: true } }>;

// Çözümlenmiş kalem: açıklama + miktar + birim fiyat netleşmiş.
interface ResolvedLine {
  productId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly repo: QuotesRepository,
    private readonly products: ProductsService,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateQuoteDto, actor: AuthenticatedUser) {
    this.assertTaxRate(dto.taxRate);
    const lines = await this.resolveLines(dto.lineItems);
    const totals = calcTotals(lines, dto.taxRate);

    const quote = await this.repo.create(
      {
        dealId: dto.dealId,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        currency: dto.currency ?? 'EUR',
        subtotal: totals.subtotal,
        taxRate: dto.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        createdById: actor.id,
      },
      lines.map((l, i) => ({ ...l, lineTotal: totals.lineTotals[i] })),
    );
    this.logger.log(`quote.create by=${actor.id} quote=${quote.id}`);
    return this.toView(quote);
  }

  async findAll(q: QueryQuoteDto) {
    const where: Prisma.QuoteWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.q) {
      where.OR = [
        { customerName: { contains: q.q, mode: 'insensitive' } },
        { number: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return {
      data: items.map((it) => this.toView(it)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string) {
    return this.toView(await this.getOrThrow(id));
  }

  async update(id: string, dto: UpdateQuoteDto, actor: AuthenticatedUser) {
    const quote = await this.getOrThrow(id);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new ConflictException('Seul un devis au statut DRAFT peut être modifié.');
    }
    const taxRate = dto.taxRate ?? quote.taxRate.toString();
    this.assertTaxRate(taxRate);

    // Kalemler verilmişse çözümle; yoksa mevcutları koru.
    const lines: ResolvedLine[] = dto.lineItems
      ? await this.resolveLines(dto.lineItems)
      : quote.lineItems.map((li) => ({
          productId: li.productId ?? undefined,
          description: li.description,
          quantity: li.quantity.toString(),
          unitPrice: li.unitPrice.toString(),
        }));
    const totals = calcTotals(lines, taxRate);

    const updated = await this.repo.replaceDraft(
      id,
      {
        customerName: dto.customerName ?? quote.customerName,
        customerEmail: dto.customerEmail ?? quote.customerEmail ?? undefined,
        currency: dto.currency ?? quote.currency,
        subtotal: totals.subtotal,
        taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        validUntil: dto.validUntil
          ? new Date(dto.validUntil)
          : (quote.validUntil ?? undefined),
      },
      lines.map((l, i) => ({ ...l, lineTotal: totals.lineTotals[i] })),
    );
    this.logger.log(`quote.update by=${actor.id} quote=${id}`);
    return this.toView(updated);
  }

  async send(id: string, actor: AuthenticatedUser) {
    const quote = await this.getOrThrow(id);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new ConflictException('Seul un devis au statut DRAFT peut être envoyé.');
    }
    if (quote.lineItems.length === 0) {
      throw new BadRequestException('Un devis sans ligne ne peut pas être envoyé.');
    }
    const sent = await this.repo.sendWithNumber(
      id,
      new Date().getUTCFullYear(),
    );
    this.logger.log(`quote.send by=${actor.id} quote=${id} no=${sent.number}`);
    this.events.emit('quote.sent', { quoteId: id, number: sent.number });
    return this.toView(sent);
  }

  async accept(id: string, actor: AuthenticatedUser) {
    return this.transition(id, actor, 'accept', QuoteStatus.ACCEPTED, [
      QuoteStatus.SENT,
    ]);
  }

  async reject(id: string, actor: AuthenticatedUser) {
    return this.transition(id, actor, 'reject', QuoteStatus.REJECTED, [
      QuoteStatus.SENT,
      QuoteStatus.DRAFT,
    ]);
  }

  // Teklifi faturaya çevirir (ACCEPTED veya SENT). Idempotent: zaten dönüştürülmüşse 409.
  async convert(id: string, actor: AuthenticatedUser) {
    const quote = await this.getOrThrow(id);
    if (quote.status === QuoteStatus.CONVERTED || quote.convertedInvoiceId) {
      throw new ConflictException(
        'Teklif zaten faturaya dönüştürülmüş (çift dönüşüm engellendi).',
      );
    }
    if (
      quote.status !== QuoteStatus.ACCEPTED &&
      quote.status !== QuoteStatus.SENT
    ) {
      throw new ConflictException(
        'Yalnız ACCEPTED/SENT teklif faturaya dönüştürülebilir.',
      );
    }
    const { invoice, quote: updated } = await this.repo.convertToInvoice({
      quoteId: id,
      invoice: {
        dealId: quote.dealId ?? undefined,
        customerName: quote.customerName,
        customerEmail: quote.customerEmail ?? undefined,
        currency: quote.currency,
        subtotal: quote.subtotal,
        taxRate: quote.taxRate,
        taxAmount: quote.taxAmount,
        total: quote.total,
        createdById: actor.id,
      },
      lineItems: quote.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        lineTotal: li.lineTotal,
      })),
    });
    this.logger.log(
      `quote.convert by=${actor.id} quote=${id} invoice=${invoice.id}`,
    );
    this.events.emit('quote.converted', {
      quoteId: id,
      invoiceId: invoice.id,
    });
    return { quote: this.toView(updated), invoiceId: invoice.id };
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const quote = await this.getOrThrow(id);
    // CONVERTED teklif silinemez (fatura ile bağlı; iz korunur).
    if (quote.status === QuoteStatus.CONVERTED) {
      throw new ConflictException('Un devis converti ne peut pas être supprimé.');
    }
    await this.repo.delete(id);
    this.logger.log(`quote.delete by=${actor.id} quote=${id}`);
    return { deleted: true };
  }

  // --- Yardımcılar ---

  private async transition(
    id: string,
    actor: AuthenticatedUser,
    label: string,
    to: QuoteStatus,
    from: QuoteStatus[],
  ) {
    const quote = await this.getOrThrow(id);
    if (!from.includes(quote.status)) {
      throw new ConflictException(
        `Geçersiz durum geçişi (${quote.status} → ${to}).`,
      );
    }
    const updated = await this.repo.setStatus(id, to);
    this.logger.log(`quote.${label} by=${actor.id} quote=${id}`);
    return this.toView(updated);
  }

  private async resolveLines(
    items: CreateQuoteLineItemDto[],
  ): Promise<ResolvedLine[]> {
    const out: ResolvedLine[] = [];
    for (const it of items) {
      let description = it.description;
      let unitPrice = it.unitPrice;
      if (it.productId) {
        const p = await this.products.findOne(it.productId); // yoksa 404
        description = description ?? p.name;
        unitPrice = unitPrice ?? p.unitPrice;
      }
      if (!description) {
        throw new BadRequestException(
          'Kalem için açıklama gerekli (productId yoksa).',
        );
      }
      if (unitPrice === undefined) {
        throw new BadRequestException(
          'Kalem için birim fiyat gerekli (productId yoksa).',
        );
      }
      if (new D(it.quantity).lte(0)) {
        throw new BadRequestException('La quantité doit être positive.');
      }
      out.push({
        productId: it.productId,
        description,
        quantity: it.quantity,
        unitPrice,
      });
    }
    return out;
  }

  private async getOrThrow(id: string): Promise<QuoteWithItems> {
    const quote = await this.repo.findById(id);
    if (!quote) throw new NotFoundException('Devis introuvable');
    return quote;
  }

  private assertTaxRate(taxRate: string): void {
    const t = new D(taxRate);
    if (t.lt(0) || t.gt(100)) {
      throw new BadRequestException('taxRate doit être compris entre 0 et 100.');
    }
  }

  private toView(q: QuoteWithItems) {
    return {
      id: q.id,
      number: q.number,
      dealId: q.dealId,
      customerName: q.customerName,
      customerEmail: q.customerEmail,
      status: q.status,
      currency: q.currency,
      subtotal: q.subtotal.toString(),
      taxRate: q.taxRate.toString(),
      taxAmount: q.taxAmount.toString(),
      total: q.total.toString(),
      validUntil: q.validUntil,
      convertedInvoiceId: q.convertedInvoiceId,
      lineItems: q.lineItems.map((li) => ({
        id: li.id,
        productId: li.productId,
        description: li.description,
        quantity: li.quantity.toString(),
        unitPrice: li.unitPrice.toString(),
        lineTotal: li.lineTotal.toString(),
      })),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  }
}
