// src/modules/invoices/invoices.repository.ts
// ACCÈS AUX DONNÉES : les appels Prisma sont UNIQUEMENT ici.
// Numéro séquentiel : incrément atomique avec verrou de ligne (ON CONFLICT) → sans saut ni collision.
import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface LineItemData {
  description: string;
  quantity: Prisma.Decimal | string;
  unitPrice: Prisma.Decimal | string;
  lineTotal: Prisma.Decimal | string;
}

@Injectable()
export class InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    scalars: {
      dealId?: string;
      customerName: string;
      customerEmail?: string;
      currency: string;
      pricesIncludeTax?: boolean;
      subtotal: Prisma.Decimal;
      taxRate: Prisma.Decimal | string;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      createdById: string;
    },
    lineItems: LineItemData[],
  ) {
    return this.prisma.invoice.create({
      data: {
        ...scalars,
        lineItems: { create: lineItems },
      },
      include: { lineItems: true, payments: true },
    });
  }

  findById(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: { lineItems: true, payments: true },
    });
  }

  async list(where: Prisma.InvoiceWhereInput, skip: number, take: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { lineItems: true, payments: true },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total };
  }

  // Modifie le contenu d'un DRAFT : lignes supprimées puis recréées + totaux.
  replaceDraft(
    id: string,
    scalars: {
      customerName?: string;
      customerEmail?: string;
      subtotal: Prisma.Decimal;
      taxRate: Prisma.Decimal | string;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
    },
    lineItems: LineItemData[],
  ) {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...scalars,
        lineItems: { deleteMany: {}, create: lineItems },
      },
      include: { lineItems: true, payments: true },
    });
  }

  // DRAFT → SENT : incrémente atomiquement le compteur annuel et attribue le numéro, en une transaction.
  async issueWithNumber(id: string, year: number, dueAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ lastNumber: number }[]>(Prisma.sql`
        INSERT INTO "InvoiceCounter" ("year", "lastNumber") VALUES (${year}, 1)
        ON CONFLICT ("year")
        DO UPDATE SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1
        RETURNING "lastNumber";
      `);
      const seq = rows[0].lastNumber;
      const number = `INV-${year}-${String(seq).padStart(6, '0')}`;
      return tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.SENT,
          number,
          issuedAt: new Date(),
          dueAt,
        },
        include: { lineItems: true, payments: true },
      });
    });
  }

  // Ödeme + fatura güncelle (tek transaction).
  async addPayment(params: {
    invoiceId: string;
    amount: Prisma.Decimal | string;
    method: string;
    reference?: string;
    recordedById: string;
    newAmountPaid: Prisma.Decimal;
    status: InvoiceStatus;
  }) {
    const [, invoice] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          invoiceId: params.invoiceId,
          amount: params.amount,
          method: params.method,
          reference: params.reference,
          recordedById: params.recordedById,
        },
      }),
      this.prisma.invoice.update({
        where: { id: params.invoiceId },
        data: { amountPaid: params.newAmountPaid, status: params.status },
        include: { lineItems: true, payments: true },
      }),
    ]);
    return invoice;
  }

  cancel(id: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
      include: { lineItems: true, payments: true },
    });
  }
}
