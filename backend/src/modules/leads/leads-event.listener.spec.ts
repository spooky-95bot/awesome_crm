// src/modules/leads/leads-event.listener.spec.ts
// Tests du flux de réservation Elysence :
// - lead.created → reservation.received (cliente) + reservation.admin (maison)
// - lead.status_changed → QUALIFIED → reservation.confirmed (cliente)
// - Idempotence, filtrage par canal, pas d'email si pas d'email
import { LeadsEventListener } from './leads-event.listener';
import { LeadChannel, LeadStatus } from '@prisma/client';

describe('LeadsEventListener', () => {
  let listener: LeadsEventListener;
  let mail: { enqueue: jest.Mock };

  const basePayload = {
    leadId: 'lead-123',
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie@example.com',
    phone: '0600000000',
    companyName: null,
    channel: LeadChannel.FORM,
    source: 'site',
    meta: {
      formName: 'Réservation',
      fields: {
        service: 'Massage relaxant',
        date: '2026-10-10',
        timeSlot: '14:00',
        message: 'Disponible le 10 octobre',
      },
    },
  };

  beforeEach(() => {
    mail = { enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1', duplicate: false }) };
    listener = new LeadsEventListener(mail as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('lead.created', () => {
    it('envoie reservation.received à la cliente et reservation.admin à la maison', async () => {
      await listener.onLeadCreated(basePayload as any);

      expect(mail.enqueue).toHaveBeenCalledTimes(2);

      // 1) Accusé de réception à la cliente
      expect(mail.enqueue).toHaveBeenNthCalledWith(1, {
        to: 'marie@example.com',
        template: 'reservation.received',
        context: expect.objectContaining({
          firstName: 'Marie',
          service: 'Massage relaxant',
          date: '2026-10-10',
          timeSlot: '14:00',
        }),
        idempotencyKey: 'lead-123:received',
        tenantId: 'elysence',
      });

      // 2) Notification à la maison
      expect(mail.enqueue).toHaveBeenNthCalledWith(2, {
        to: expect.any(String),
        template: 'reservation.admin',
        context: expect.objectContaining({
          firstName: 'Marie',
          lastName: 'Dupont',
          email: 'marie@example.com',
          service: 'Massage relaxant',
        }),
        idempotencyKey: 'lead-123:admin',
        tenantId: 'elysence',
      });
    });

    it('n\'envoie rien si le canal n\'est pas FORM', async () => {
      await listener.onLeadCreated({
        ...basePayload,
        channel: LeadChannel.MANUAL,
      } as any);

      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('n\'envoie pas reservation.received si pas d\'email mais envoie reservation.admin', async () => {
      await listener.onLeadCreated({
        ...basePayload,
        email: null,
      } as any);

      expect(mail.enqueue).toHaveBeenCalledTimes(1);
      expect(mail.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'reservation.admin' }),
      );
    });

    it('utilise RESERVATION_ADMIN_EMAIL si défini', async () => {
      const original = process.env.RESERVATION_ADMIN_EMAIL;
      process.env.RESERVATION_ADMIN_EMAIL = 'pro@elysence.fr';

      await listener.onLeadCreated(basePayload as any);

      expect(mail.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'pro@elysence.fr' }),
      );

      if (original === undefined) {
        delete process.env.RESERVATION_ADMIN_EMAIL;
      } else {
        process.env.RESERVATION_ADMIN_EMAIL = original;
      }
    });

    it('utilise le fallback maisonelysence@hotmail.com si RESERVATION_ADMIN_EMAIL n\'est pas défini', async () => {
      const original = process.env.RESERVATION_ADMIN_EMAIL;
      delete process.env.RESERVATION_ADMIN_EMAIL;

      await listener.onLeadCreated(basePayload as any);

      expect(mail.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'maisonelysence@hotmail.com' }),
      );

      if (original !== undefined) {
        process.env.RESERVATION_ADMIN_EMAIL = original;
      }
    });

    it('ne lève pas si enqueue échoue (erreur silencieuse journalisée)', async () => {
      mail.enqueue.mockRejectedValueOnce(new Error('DB error'));

      await expect(listener.onLeadCreated(basePayload as any)).resolves.toBeUndefined();
    });
  });

  describe('lead.status_changed', () => {
    it('envoie reservation.confirmed quand le statut passe à QUALIFIED', async () => {
      await listener.onLeadStatusChanged({
        ...basePayload,
        previousStatus: LeadStatus.NEW,
        newStatus: LeadStatus.QUALIFIED,
      } as any);

      expect(mail.enqueue).toHaveBeenCalledTimes(1);
      expect(mail.enqueue).toHaveBeenCalledWith({
        to: 'marie@example.com',
        template: 'reservation.confirmed',
        context: expect.objectContaining({
          firstName: 'Marie',
          service: 'Massage relaxant',
          date: '2026-10-10',
          timeSlot: '14:00',
        }),
        idempotencyKey: 'lead-123:confirmed',
        tenantId: 'elysence',
      });
    });

    it('n\'envoie rien si le nouveau statut n\'est pas QUALIFIED', async () => {
      await listener.onLeadStatusChanged({
        ...basePayload,
        previousStatus: LeadStatus.NEW,
        newStatus: LeadStatus.WORKING,
      } as any);

      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('n\'envoie rien si le canal n\'est pas FORM', async () => {
      await listener.onLeadStatusChanged({
        ...basePayload,
        channel: LeadChannel.MANUAL,
        previousStatus: LeadStatus.NEW,
        newStatus: LeadStatus.QUALIFIED,
      } as any);

      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('n\'envoie rien si pas d\'email', async () => {
      await listener.onLeadStatusChanged({
        ...basePayload,
        email: null,
        previousStatus: LeadStatus.NEW,
        newStatus: LeadStatus.QUALIFIED,
      } as any);

      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('ne lève pas si enqueue échoue', async () => {
      mail.enqueue.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        listener.onLeadStatusChanged({
          ...basePayload,
          previousStatus: LeadStatus.NEW,
          newStatus: LeadStatus.QUALIFIED,
        } as any),
      ).resolves.toBeUndefined();
    });
  });

  describe('idempotence', () => {
    it('utilise des clés d\'idempotence distinctes pour chaque template', async () => {
      await listener.onLeadCreated(basePayload as any);
      await listener.onLeadStatusChanged({
        ...basePayload,
        previousStatus: LeadStatus.NEW,
        newStatus: LeadStatus.QUALIFIED,
      } as any);

      const keys = mail.enqueue.mock.calls.map((c: any[]) => c[0].idempotencyKey);
      expect(keys).toEqual(['lead-123:received', 'lead-123:admin', 'lead-123:confirmed']);
      expect(new Set(keys).size).toBe(3);
    });
  });

  describe('buildContext', () => {
    it('lit les champs depuis meta.fields', async () => {
      await listener.onLeadCreated(basePayload as any);

      const context = mail.enqueue.mock.calls[0][0].context;
      expect(context.service).toBe('Massage relaxant');
      expect(context.date).toBe('2026-10-10');
      expect(context.timeSlot).toBe('14:00');
      expect(context.message).toBe('Disponible le 10 octobre');
    });

    it('gère meta null sans erreur', async () => {
      await listener.onLeadCreated({
        ...basePayload,
        meta: null,
      } as any);

      const context = mail.enqueue.mock.calls[0][0].context;
      expect(context.service).toBe('');
      expect(context.date).toBe('');
      expect(context.timeSlot).toBe('');
    });
  });
});
