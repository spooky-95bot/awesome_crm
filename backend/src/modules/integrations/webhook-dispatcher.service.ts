// src/modules/integrations/webhook-dispatcher.service.ts
// Livraison sortante : signature → POST → enregistrement WebhookDelivery (SUCCESS/FAILED+backoff/DEAD).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { IntegrationsRepository } from './integrations.repository';
import { HTTP_CLIENT, IHttpClient } from './http/http-client.interface';
import { signPayload } from './util/webhook-signature.util';
import { computeNextRetry } from './util/backoff.util';

const TIMEOUT_MS = 5000;

interface Subscription {
  id: string;
  url: string;
  secret: string;
}

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly repo: IntegrationsRepository,
    @Inject(HTTP_CLIENT) private readonly http: IHttpClient,
  ) {}

  // Tente de livrer un événement à un seul abonnement ; renvoie l'enregistrement de livraison.
  async dispatch(
    sub: Subscription,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(sub.secret, timestamp, body);

    const delivery = await this.repo.createDelivery({
      subscriptionId: sub.id,
      event,
      payload: payload as Prisma.InputJsonObject,
      signature,
      status: DeliveryStatus.PENDING,
      attempts: 0,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CRM-Event': event,
      'X-CRM-Timestamp': String(timestamp),
      'X-CRM-Signature': signature,
      'X-CRM-Delivery': delivery.id, // clé d'idempotence
    };

    try {
      const res = await this.http.post(sub.url, body, headers, TIMEOUT_MS);
      if (res.status >= 200 && res.status < 300) {
        return this.repo.updateDelivery(delivery.id, {
          status: DeliveryStatus.SUCCESS,
          attempts: 1,
          nextRetryAt: null,
        });
      }
      return this.fail(delivery.id, 1, `HTTP ${res.status}`);
    } catch (err) {
      return this.fail(
        delivery.id,
        1,
        err instanceof Error ? err.message : 'network error',
      );
    }
  }

  // Relance les livraisons FAILED échues. (Un cron/worker appelle ceci —
  // LIMITE PRAGMATIQUE : le worker planifié n'est pas encore installé à cette étape ; la méthode est prête et testée.)
  async processDuePending(nowMs: number = Date.now()): Promise<number> {
    const due = await this.repo.findDueDeliveries(new Date(nowMs));
    for (const d of due) {
      const body = JSON.stringify(d.payload);
      const timestamp = Math.floor(nowMs / 1000);
      const signature = signPayload(d.subscription.secret, timestamp, body);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CRM-Event': d.event,
        'X-CRM-Timestamp': String(timestamp),
        'X-CRM-Signature': signature,
        'X-CRM-Delivery': d.id,
      };
      try {
        const res = await this.http.post(
          d.subscription.url,
          body,
          headers,
          TIMEOUT_MS,
        );
        if (res.status >= 200 && res.status < 300) {
          await this.repo.updateDelivery(d.id, {
            status: DeliveryStatus.SUCCESS,
            attempts: d.attempts + 1,
            nextRetryAt: null,
          });
          continue;
        }
        await this.fail(d.id, d.attempts + 1, `HTTP ${res.status}`, nowMs);
      } catch (err) {
        await this.fail(
          d.id,
          d.attempts + 1,
          err instanceof Error ? err.message : 'network error',
          nowMs,
        );
      }
    }
    return due.length;
  }

  private fail(
    deliveryId: string,
    attempts: number,
    error: string,
    nowMs: number = Date.now(),
  ) {
    const nextRetryAt = computeNextRetry(attempts, nowMs);
    const status = nextRetryAt ? DeliveryStatus.FAILED : DeliveryStatus.DEAD;
    this.logger.warn(
      `webhook delivery ${deliveryId} ${status} (attempt ${attempts}): ${error}`,
    );
    return this.repo.updateDelivery(deliveryId, {
      status,
      attempts,
      nextRetryAt,
      lastError: error,
    });
  }
}
