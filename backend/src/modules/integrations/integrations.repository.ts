// src/modules/integrations/integrations.repository.ts
// ACCÈS AUX DONNÉES : les appels Prisma sont UNIQUEMENT ici.
import { Injectable } from '@nestjs/common';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSubscription(data: {
    url: string;
    events: string[];
    secret: string;
    createdById: string;
  }) {
    return this.prisma.webhookSubscription.create({ data });
  }

  listSubscriptions() {
    return this.prisma.webhookSubscription.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findSubscriptionById(id: string) {
    return this.prisma.webhookSubscription.findUnique({ where: { id } });
  }

  deleteSubscription(id: string) {
    return this.prisma.webhookSubscription.delete({ where: { id } });
  }

  findActiveSubscriptionsForEvent(event: string) {
    return this.prisma.webhookSubscription.findMany({
      where: { isActive: true, events: { has: event } },
    });
  }

  createDelivery(data: {
    subscriptionId: string;
    event: string;
    payload: Prisma.InputJsonValue;
    signature: string;
    status: DeliveryStatus;
    attempts: number;
    nextRetryAt?: Date | null;
    lastError?: string | null;
  }) {
    return this.prisma.webhookDelivery.create({ data });
  }

  updateDelivery(
    id: string,
    data: {
      status: DeliveryStatus;
      attempts: number;
      nextRetryAt?: Date | null;
      lastError?: string | null;
    },
  ) {
    return this.prisma.webhookDelivery.update({ where: { id }, data });
  }

  findDeliveryById(id: string) {
    return this.prisma.webhookDelivery.findUnique({
      where: { id },
      include: { subscription: true },
    });
  }

  listDeliveries(subscriptionId: string) {
    return this.prisma.webhookDelivery.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findDueDeliveries(now: Date) {
    return this.prisma.webhookDelivery.findMany({
      where: {
        status: DeliveryStatus.FAILED,
        nextRetryAt: { lte: now },
      },
      include: { subscription: true },
      take: 50,
    });
  }

  // --- Gelen webhook idempotency ---

  findProcessed(key: string) {
    return this.prisma.processedWebhook.findUnique({ where: { key } });
  }

  createProcessed(key: string, source: string) {
    return this.prisma.processedWebhook.create({ data: { key, source } });
  }
}
