// src/modules/integrations/mail/mail.service.ts
// Envoi d'e-mail : nettoyage anti-injection d'en-tête + journalisation EmailLog.
// S'appuie sur l'abstraction IMailProvider. Le transport reste interchangeable.
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IMailProvider,
  MAIL_PROVIDER,
  MailInput,
} from './mail-provider.interface';
import { renderTemplate } from './mail-templates';

// Recul exponentiel borné : 1 min, 5 min, 15 min, 1 h, 4 h.
const BACKOFF_SECONDS = [60, 300, 900, 3600, 14400];

export interface EnqueueInput {
  to: string;
  template: string;
  context: Record<string, unknown>;
  idempotencyKey: string;
  tenantId?: string | null;
  maxAttempts?: number;
}

export interface DeliverResult {
  status: 'SENT' | 'SIMULATED' | 'FAILED' | 'DEAD' | 'DUPLICATE';
  outboxId?: string;
  error?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: IMailProvider,
    private readonly prisma: PrismaService,
  ) {}

  // Rend un modèle et l'envoie immédiatement (chemin direct, conservé pour compatibilité).
  async sendTemplate(
    to: string,
    template: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const { subject } = renderTemplate(template, context);
    await this.send({ to, subject, template, context });
  }

  async send(input: MailInput): Promise<void> {
    this.assertNoCrlf(input.to, 'to');
    this.assertNoCrlf(input.subject, 'subject');

    try {
      await this.provider.send(input);
      await this.prisma.emailLog.create({
        data: {
          to: input.to,
          subject: input.subject,
          template: input.template,
          status: this.provider.driver === 'simulated' ? 'SIMULATED' : 'SENT',
        },
      });
    } catch (err) {
      await this.prisma.emailLog.create({
        data: {
          to: input.to,
          subject: input.subject,
          template: input.template,
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'unknown',
        },
      });
      throw err;
    }
  }

  // --- File d'attente persistante -----------------------------------------

  /**
   * Met un e-mail en file. Idempotent : si la clé existe déjà, aucun doublon
   * n'est créé. Le message est envoyé plus tard par le worker.
   */
  async enqueue(input: EnqueueInput): Promise<{ id: string; duplicate: boolean }> {
    const { subject } = renderTemplate(input.template, input.context);

    const existing = await this.prisma.emailOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, duplicate: true };
    }

    try {
      const row = await this.prisma.emailOutbox.create({
        data: {
          to: input.to,
          subject,
          template: input.template,
          context: input.context as object,
          idempotencyKey: input.idempotencyKey,
          tenantId: input.tenantId ?? null,
          maxAttempts: input.maxAttempts ?? 5,
          status: 'PENDING',
        },
        select: { id: true },
      });
      return { id: row.id, duplicate: false };
    } catch (err) {
      // Course entre deux appels concurrents : la contrainte unique tranche.
      if (this.isUniqueViolation(err)) {
        const row = await this.prisma.emailOutbox.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        return { id: row?.id ?? '', duplicate: true };
      }
      throw err;
    }
  }

  /**
   * Traite un message de la file. Un essai = un appel transport.
   * - succès transport simulé  -> SIMULATED (jamais confondu avec SENT)
   * - succès transport réel    -> SENT
   * - échec, essais restants   -> FAILED + report (nextAttemptAt)
   * - échec, essais épuisés    -> DEAD
   */
  async deliver(outboxId: string): Promise<DeliverResult> {
    const row = await this.prisma.emailOutbox.findUnique({ where: { id: outboxId } });
    if (!row) return { status: 'FAILED', error: 'introuvable' };

    // Ne jamais reprendre un message déjà abouti.
    if (row.status === 'SENT' || row.status === 'SIMULATED') {
      return { status: row.status as 'SENT' | 'SIMULATED', outboxId };
    }

    await this.prisma.emailOutbox.update({
      where: { id: outboxId },
      data: { status: 'SENDING' },
    });

    const attempts = row.attempts + 1;
    const input: MailInput = {
      to: row.to,
      subject: row.subject,
      template: row.template,
      context: (row.context ?? {}) as Record<string, unknown>,
    };

    try {
      this.assertNoCrlf(input.to, 'to');
      this.assertNoCrlf(input.subject, 'subject');
      await this.provider.send(input);

      const simulated = this.provider.driver === 'simulated';
      const status = simulated ? 'SIMULATED' : 'SENT';

      await this.prisma.emailOutbox.update({
        where: { id: outboxId },
        data: {
          status,
          attempts,
          driver: this.provider.driver,
          sentAt: new Date(),
          lastError: null,
        },
      });
      await this.prisma.emailLog.create({
        data: {
          to: row.to,
          subject: row.subject,
          template: row.template,
          status,
        },
      });
      return { status, outboxId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      const exhausted = attempts >= row.maxAttempts;
      const delay = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];

      await this.prisma.emailOutbox.update({
        where: { id: outboxId },
        data: {
          status: exhausted ? 'DEAD' : 'FAILED',
          attempts,
          driver: this.provider.driver,
          lastError: message.slice(0, 1000),
          nextAttemptAt: exhausted ? row.nextAttemptAt : new Date(Date.now() + delay * 1000),
        },
      });
      await this.prisma.emailLog.create({
        data: {
          to: row.to,
          subject: row.subject,
          template: row.template,
          status: 'FAILED',
          error: message.slice(0, 1000),
        },
      });
      return { status: exhausted ? 'DEAD' : 'FAILED', outboxId, error: message };
    }
  }

  /**
   * Renvoie les messages à traiter (statut PENDING ou FAILED dont l'échéance
   * est passée), dans l'ordre d'ancienneté, borné par `limit`.
   */
  async claimDue(limit = 20): Promise<{ id: string }[]> {
    return this.prisma.emailOutbox.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
  }

  /** Traite la file : renvoie un bilan chiffré (sans jamais prétendre plus que le transport). */
  async processDue(limit = 20): Promise<Record<string, number>> {
    const due = await this.claimDue(limit);
    const summary: Record<string, number> = {};
    for (const item of due) {
      const res = await this.deliver(item.id);
      summary[res.status] = (summary[res.status] ?? 0) + 1;
    }
    return summary;
  }

  private isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
  }

  private assertNoCrlf(value: string, field: string): void {
    if (/[\r\n]/.test(value)) {
      throw new BadRequestException(`${field}: caractère invalide (CRLF).`);
    }
  }
}
