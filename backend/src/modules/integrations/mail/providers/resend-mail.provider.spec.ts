// src/modules/integrations/mail/providers/resend-mail.provider.spec.ts
import { ConfigService } from '@nestjs/config';
import { ResendMailProvider } from './resend-mail.provider';
import { MailInput } from '../mail-provider.interface';

describe('ResendMailProvider', () => {
  let provider: ResendMailProvider;
  let config: { get: jest.Mock };
  let fetchMock: jest.Mock;

  const validInput: MailInput = {
    to: 'client@example.com',
    subject: 'Test',
    template: 'reservation.confirmed',
    context: { firstName: 'Marie', date: '2026-10-10', timeSlot: '14:00' },
  };

  beforeEach(() => {
    config = {
      get: jest.fn((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        if (key === 'RESEND_FROM') return 'Maison ELYSENCE <maison@elysence.fr>';
        if (key === 'RESEND_REPLY_TO') return undefined;
        return undefined;
      }),
    };
    provider = new ResendMailProvider(config as unknown as ConfigService);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('driver', () => {
    it('a le driver "resend"', () => {
      expect(provider.driver).toBe('resend');
    });
  });

  describe('send — succès', () => {
    it('envoie un e-mail via l\'API Resend et retourne l\'id', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'resend-id-123' } }),
      });

      await expect(provider.send(validInput)).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer re_test_key');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.from).toBe('Maison ELYSENCE <maison@elysence.fr>');
      expect(body.to).toBe('client@example.com');
      expect(body.subject).toBe('Test');
      expect(body.text).toContain('Marie');
      expect(body.text).toContain('2026-10-10');
    });

    it('inclut reply_to si configuré', async () => {
      config.get = jest.fn((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        if (key === 'RESEND_FROM') return 'Maison ELYSENCE <maison@elysence.fr>';
        if (key === 'RESEND_REPLY_TO') return 'reply@elysence.fr';
        return undefined;
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'resend-id-456' } }),
      });

      await provider.send(validInput);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.reply_to).toBe('reply@elysence.fr');
    });
  });

  describe('send — erreurs API', () => {
    it('lève une erreur si RESEND_API_KEY est manquante', async () => {
      config.get = jest.fn(() => undefined);
      await expect(provider.send(validInput)).rejects.toThrow('RESEND_API_KEY is not configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('lève une erreur si RESEND_FROM est manquant', async () => {
      config.get = jest.fn((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return undefined;
      });
      await expect(provider.send(validInput)).rejects.toThrow('RESEND_FROM is not configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('lève une erreur sur réponse 400 avec message Resend', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid from address' } }),
      });

      await expect(provider.send(validInput)).rejects.toThrow('Invalid from address');
    });

    it('lève une erreur sur réponse 429 (rate limit)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Too many requests' } }),
      });

      await expect(provider.send(validInput)).rejects.toThrow('Too many requests');
    });

    it('lève une erreur sur réponse 500', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal server error' } }),
      });

      await expect(provider.send(validInput)).rejects.toThrow('Internal server error');
    });

    it('lève une erreur générique si le corps JSON est illisible', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => { throw new Error('invalid json'); },
      });

      await expect(provider.send(validInput)).rejects.toThrow('Resend API error (HTTP 502)');
    });
  });

  describe('send — timeout', () => {
    it('lève une erreur de timeout après 10s', async () => {
      fetchMock.mockImplementationOnce(
        () => new Promise((_, reject) => {
          const timer = setTimeout(() => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }, 11_000);
          // Simuler l'abort à 10s
          setTimeout(() => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }, 10_000);
        }),
      );

      await expect(provider.send(validInput)).rejects.toThrow('Resend API timeout');
    }, 15_000);
  });

  describe('absence de fuite de secrets', () => {
    it('n\'affiche jamais la clé API dans les logs', async () => {
      const loggerSpy = jest.spyOn((provider as any).logger, 'log');
      const errorSpy = jest.spyOn((provider as any).logger, 'error');

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'resend-id-789' } }),
      });

      await provider.send(validInput);

      const allLogs = [
        ...loggerSpy.mock.calls.map((c) => c.join(' ')),
        ...errorSpy.mock.calls.map((c) => c.join(' ')),
      ].join(' ');

      expect(allLogs).not.toContain('re_test_key');
      expect(allLogs).not.toContain('Bearer');
    });
  });

  describe('contenu de l\'e-mail', () => {
    it('n\'inclut aucun filigrane ni branding Resend dans le texte', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'resend-id-abc' } }),
      });

      await provider.send(validInput);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const text = body.text.toLowerCase();

      // Aucun filigrane Resend
      expect(text).not.toContain('resend');
      expect(text).not.toContain('sent with');
      expect(text).not.toContain('powered by');
      expect(text).not.toContain('unsubscribe');
    });

    it('le texte contient les informations de réservation', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'resend-id-def' } }),
      });

      await provider.send(validInput);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('Marie');
      expect(body.text).toContain('2026-10-10');
      expect(body.text).toContain('14:00');
      expect(body.text).toContain('Maison ELYSENCE');
    });
  });
});
