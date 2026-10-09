// src/modules/integrations/mail/mail.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { MailService } from './mail.service';
import { IMailProvider } from './mail-provider.interface';
import { PrismaService } from '../../../prisma/prisma.service';

// Faux Prisma en mémoire : reproduit les contraintes utiles (unicité, filtres).
function makePrisma() {
  const outbox: Record<string, any>[] = [];
  const logs: any[] = [];
  const api = {
    emailLog: {
      create: jest.fn(async ({ data }: any) => {
        logs.push(data);
        return data;
      }),
    },
    emailOutbox: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.idempotencyKey) {
          return outbox.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null;
        }
        return outbox.find((r) => r.id === where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        if (outbox.some((r) => r.idempotencyKey === data.idempotencyKey)) {
          const e: any = new Error('unique');
          e.code = 'P2002';
          throw e;
        }
        const row = {
          id: `id-${outbox.length + 1}`,
          attempts: 0,
          maxAttempts: 5,
          status: 'PENDING',
          nextAttemptAt: new Date(),
          createdAt: new Date(),
          ...data,
        };
        outbox.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = outbox.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      findMany: jest.fn(async ({ where, take }: any) => {
        let rows = outbox;
        if (where?.status?.in) rows = rows.filter((r) => where.status.in.includes(r.status));
        if (where?.nextAttemptAt?.lte) {
          rows = rows.filter((r) => r.nextAttemptAt <= where.nextAttemptAt.lte);
        }
        return rows.slice(0, take ?? 20).map((r) => ({ id: r.id }));
      }),
    },
    __outbox: outbox,
    __logs: logs,
  };
  return api;
}

describe('MailService', () => {
  let service: MailService;
  let provider: { driver: string; send: jest.Mock };
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    provider = { driver: 'simulated', send: jest.fn().mockResolvedValue(undefined) };
    prisma = makePrisma();
    service = new MailService(
      provider as unknown as IMailProvider,
      prisma as unknown as PrismaService,
    );
  });

  // U-5.6 — provider.send est appelé avec le bon contexte + EmailLog SIMULATED
  it('provider.send est appelé et EmailLog écrit SIMULATED', async () => {
    await service.send({
      to: 'a@b.com',
      subject: 'Bonjour',
      template: 'welcome',
      context: { name: 'X' },
    });
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', template: 'welcome' }),
    );
    expect(prisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SIMULATED' }),
      }),
    );
  });

  // S-5.2 — injection d'en-tête mail (CRLF) refusée
  it('CRLF dans le champ to → BadRequest, aucun envoi', async () => {
    await expect(
      service.send({
        to: 'a@b.com\r\nBcc: evil@x.com',
        subject: 'X',
        template: 't',
        context: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('CRLF dans le champ subject → BadRequest', async () => {
    await expect(
      service.send({
        to: 'a@b.com',
        subject: 'X\r\nInjected: 1',
        template: 't',
        context: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// --- File d'attente : idempotence, reprises, indisponibilité, isolation ------
describe('MailService — file d\'attente e-mail', () => {
  let service: MailService;
  let provider: { driver: string; send: jest.Mock };
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    provider = { driver: 'simulated', send: jest.fn().mockResolvedValue(undefined) };
    prisma = makePrisma();
    service = new MailService(
      provider as unknown as IMailProvider,
      prisma as unknown as PrismaService,
    );
  });

  const base = {
    to: 'cliente@example.fr',
    template: 'reservation.confirmed',
    context: { firstName: 'Marie', service: 'Massage relaxant', date: '15/10/2026' },
  };

  it('met un message en file sans l\'envoyer', async () => {
    const r = await service.enqueue({ ...base, idempotencyKey: 'resa-1:confirmed' });
    expect(r.duplicate).toBe(false);
    expect(provider.send).not.toHaveBeenCalled();
    expect(prisma.__outbox).toHaveLength(1);
    expect(prisma.__outbox[0].status).toBe('PENDING');
  });

  it('refuse un doublon (même clé d\'idempotence)', async () => {
    const a = await service.enqueue({ ...base, idempotencyKey: 'resa-1:confirmed' });
    const b = await service.enqueue({ ...base, idempotencyKey: 'resa-1:confirmed' });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(a.id).toBe(b.id);
    expect(prisma.__outbox).toHaveLength(1); // un seul enregistrement
  });

  it('la même clé pour un autre événement crée bien un second message', async () => {
    await service.enqueue({ ...base, idempotencyKey: 'resa-1:confirmed' });
    await service.enqueue({ ...base, idempotencyKey: 'resa-1:cancelled' });
    expect(prisma.__outbox).toHaveLength(2);
  });

  it('transport simulé → statut SIMULATED, jamais SENT', async () => {
    const { id } = await service.enqueue({ ...base, idempotencyKey: 'resa-2:confirmed' });
    const res = await service.deliver(id);
    expect(res.status).toBe('SIMULATED');
    expect(prisma.__outbox[0].status).toBe('SIMULATED');
    expect(prisma.__logs[0].status).toBe('SIMULATED');
  });

  it('transport réel → statut SENT', async () => {
    provider.driver = 'smtp';
    const { id } = await service.enqueue({ ...base, idempotencyKey: 'resa-3:confirmed' });
    const res = await service.deliver(id);
    expect(res.status).toBe('SENT');
    expect(prisma.__outbox[0].sentAt).toBeInstanceOf(Date);
  });

  it('échec transport → FAILED + report, le message est conservé', async () => {
    provider.send.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { id } = await service.enqueue({ ...base, idempotencyKey: 'resa-4:confirmed' });
    const res = await service.deliver(id);
    expect(res.status).toBe('FAILED');
    expect(prisma.__outbox[0].attempts).toBe(1);
    expect(prisma.__outbox[0].lastError).toContain('ECONNREFUSED');
    expect(prisma.__outbox[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('reprise : après un échec, un nouvel essai réussit', async () => {
    provider.send.mockRejectedValueOnce(new Error('temporaire'));
    const { id } = await service.enqueue({ ...base, idempotencyKey: 'resa-5:confirmed' });
    await service.deliver(id); // échec
    const res2 = await service.deliver(id); // reprise
    expect(res2.status).toBe('SIMULATED');
    expect(prisma.__outbox[0].attempts).toBe(2);
    expect(prisma.__outbox[0].lastError).toBeNull();
  });

  it('reprises bornées : après maxAttempts, statut DEAD (plus de retry)', async () => {
    provider.send.mockRejectedValue(new Error('panne durable'));
    const { id } = await service.enqueue({
      ...base,
      idempotencyKey: 'resa-6:confirmed',
      maxAttempts: 3,
    });
    let last;
    for (let i = 0; i < 3; i++) last = await service.deliver(id);
    expect(last!.status).toBe('DEAD');
    expect(prisma.__outbox[0].attempts).toBe(3);
  });

  it('un message déjà abouti n\'est jamais renvoyé', async () => {
    const { id } = await service.enqueue({ ...base, idempotencyKey: 'resa-7:confirmed' });
    await service.deliver(id);
    provider.send.mockClear();
    await service.deliver(id);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('claimDue ne renvoie que les messages échus', async () => {
    const a = await service.enqueue({ ...base, idempotencyKey: 'resa-8a:confirmed' });
    await service.enqueue({ ...base, idempotencyKey: 'resa-8b:confirmed' });
    // Le premier échoue → report dans le futur
    provider.send.mockRejectedValueOnce(new Error('x'));
    await service.deliver(a.id);
    const due = await service.claimDue();
    // Seul le second (PENDING, échu) doit être repris
    expect(due).toHaveLength(1);
  });

  it('séparation par tenant : les messages restent étiquetés', async () => {
    await service.enqueue({ ...base, idempotencyKey: 't-a:1', tenantId: 'elysence' });
    await service.enqueue({ ...base, idempotencyKey: 't-b:1', tenantId: 'autre-client' });
    expect(prisma.__outbox[0].tenantId).toBe('elysence');
    expect(prisma.__outbox[1].tenantId).toBe('autre-client');
    // Aucune fuite : chaque message porte son propre tenant
    expect(prisma.__outbox.filter((r) => r.tenantId === 'elysence')).toHaveLength(1);
  });

  it('processDue renvoie un bilan chiffré', async () => {
    await service.enqueue({ ...base, idempotencyKey: 'p1:confirmed' });
    await service.enqueue({ ...base, idempotencyKey: 'p2:confirmed' });
    const summary = await service.processDue();
    expect(summary.SIMULATED).toBe(2);
  });
});
