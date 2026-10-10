// src/modules/integrations/webhook-event.handler.ts
// Écoute les événements de domaine → déclenche une livraison signée vers les abonnements correspondants.
// Les services métier ne connaissent pas HTTP ; ils publient seulement des événements (couplage faible).
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IntegrationsRepository } from './integrations.repository';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

@Injectable()
export class WebhookEventHandler {
  constructor(
    private readonly repo: IntegrationsRepository,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  @OnEvent('deal.created')
  onLeadCreated(payload: Record<string, unknown>) {
    return this.dispatchEvent('deal.created', payload);
  }

  @OnEvent('deal.moved')
  onLeadMoved(payload: Record<string, unknown>) {
    return this.dispatchEvent('deal.moved', payload);
  }

  @OnEvent('invoice.issued')
  onInvoiceIssued(payload: Record<string, unknown>) {
    return this.dispatchEvent('invoice.issued', payload);
  }

  @OnEvent('invoice.paid')
  onInvoicePaid(payload: Record<string, unknown>) {
    return this.dispatchEvent('invoice.paid', payload);
  }

  private async dispatchEvent(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const subs = await this.repo.findActiveSubscriptionsForEvent(event);
    for (const sub of subs) {
      await this.dispatcher.dispatch(sub, event, payload);
    }
  }
}
