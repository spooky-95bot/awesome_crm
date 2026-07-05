// src/modules/payments/payments.repository.ts
// VERİ ERİŞİMİ: PaymentIntent Prisma çağrıları YALNIZCA burada.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createIntent(data: {
    invoiceId: string;
    token: string;
    conversationId: string;
    amount: Prisma.Decimal | string;
    currency: string;
    createdById: string;
  }) {
    return this.prisma.paymentIntent.create({ data });
  }

  findByToken(token: string) {
    return this.prisma.paymentIntent.findUnique({ where: { token } });
  }

  listByInvoice(invoiceId: string) {
    return this.prisma.paymentIntent.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ATOMİK idempotency: yalnız pending → paid geçebilen ilk çağrı count=1 alır (yarış güvenli).
  async claimPaid(token: string, providerRef: string | null): Promise<boolean> {
    const r = await this.prisma.paymentIntent.updateMany({
      where: { token, status: 'pending' },
      data: { status: 'paid', providerRef },
    });
    return r.count === 1;
  }

  async markFailed(token: string, providerRef: string | null): Promise<void> {
    await this.prisma.paymentIntent.updateMany({
      where: { token, status: 'pending' },
      data: { status: 'failed', providerRef },
    });
  }
}
