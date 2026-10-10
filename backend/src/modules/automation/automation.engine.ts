// src/modules/automation/automation.engine.ts
// Écoute les événements de domaine → exécute les règles d'automatisation correspondantes (couplage faible).
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AutomationRepository } from './automation.repository';
import { MailService } from '../integrations/mail/mail.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

type Payload = Record<string, unknown>;
interface Condition {
  field: string;
  equals: string;
}
interface Action {
  type: string;
  note?: string;
  template?: string;
  to?: string;
}

// Pur : la condition correspond-elle au payload ? (une règle sans condition correspond toujours)
export function evaluateConditions(
  conditions: Condition | null | undefined,
  payload: Payload,
): boolean {
  if (!conditions || !conditions.field) return true;
  return String(payload[conditions.field]) === String(conditions.equals);
}

// Pur : remplace les placeholders "{{champ}}" par les valeurs du payload (corps whatsapp/e-mail).
export function interpolate(templateText: string, payload: Payload): string {
  return templateText.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    payload[key] === undefined || payload[key] === null
      ? ''
      : String(payload[key]),
  );
}

@Injectable()
export class AutomationEngine {
  private readonly logger = new Logger(AutomationEngine.name);

  constructor(
    private readonly repo: AutomationRepository,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @OnEvent('deal.created')
  onDealCreated(p: Payload) {
    return this.run('deal.created', p);
  }
  @OnEvent('deal.moved')
  onDealMoved(p: Payload) {
    return this.run('deal.moved', p);
  }
  @OnEvent('lead.created')
  onLeadCreated(p: Payload) {
    return this.run('lead.created', p);
  }
  @OnEvent('invoice.paid')
  onInvoicePaid(p: Payload) {
    return this.run('invoice.paid', p);
  }
  @OnEvent('invoice.issued')
  onInvoiceIssued(p: Payload) {
    return this.run('invoice.issued', p);
  }

  async run(trigger: string, payload: Payload): Promise<void> {
    const rules = await this.repo.findActiveByTrigger(trigger);
    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Condition | null;
      if (!evaluateConditions(conditions, payload)) continue;
      const actions = (rule.actions as unknown as Action[]) ?? [];
      for (const action of actions) {
        await this.execute(action, payload).catch((err) =>
          this.logger.warn(
            ` règle ${rule.id} action ${action.type} erreur: ${
              err instanceof Error ? err.message : err
            }`,
          ),
        );
      }
    }
  }

  private async execute(action: Action, payload: Payload): Promise<void> {
    switch (action.type) {
      case 'create_activity': {
        const dealId = payload.dealId as string | undefined;
        if (dealId) {
          await this.repo.createDealActivity(
            dealId,
            'automation',
            action.note ?? 'Otomasyon notu',
          );
        }
        return;
      }
      case 'send_email': {
        if (action.to && action.template) {
          await this.mail.sendTemplate(action.to, action.template, payload);
        }
        return;
      }
      case 'send_whatsapp': {
        // Destinataire : numéro fixe (action.to) ou téléphone du payload (ex : lead.created).
        const to = action.to || (payload.phone as string | undefined);
        if (to && action.note) {
          await this.whatsapp.send({
            to,
            body: interpolate(action.note, payload),
            leadId: (payload.leadId as string | undefined) ?? null,
          });
        }
        return;
      }
      case 'log':
      default:
        this.logger.log(
          `automation: ${action.note ?? action.type} ${JSON.stringify(payload)}`,
        );
        return;
    }
  }
}
