// src/modules/integrations/mail/mail.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { MailService } from './mail.service';
import { IMailProvider } from './mail-provider.interface';
import { PrismaService } from '../../../prisma/prisma.service';

describe('MailService', () => {
  let service: MailService;
  let provider: { driver: string; send: jest.Mock };
  let prisma: { emailLog: { create: jest.Mock } };

  beforeEach(() => {
    provider = {
      driver: 'simulated',
      send: jest.fn().mockResolvedValue(undefined),
    };
    prisma = { emailLog: { create: jest.fn().mockResolvedValue({}) } };
    service = new MailService(
      provider as unknown as IMailProvider,
      prisma as unknown as PrismaService,
    );
  });

  // U-5.6 — provider.send est appelé avec le bon contexte + EmailLog SIMULATED
  it('provider.send est appelé et EmailLog écrit SIMULATED', async () => {
    await service.send({
      to: 'a@b.com',
      subject: 'Merhaba',
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
