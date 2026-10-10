// src/modules/integrations/integrations.module.ts
import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationsRepository } from './integrations.repository';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookEventHandler } from './webhook-event.handler';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail/mail.service';
import { MailOutboxController } from './mail/mail-outbox.controller';
import { MAIL_PROVIDER } from './mail/mail-provider.interface';
import { SimulatedMailProvider } from './mail/providers/simulated-mail.provider';
import { SmtpMailProvider } from './mail/providers/smtp-mail.provider';
import { ResendMailProvider } from './mail/providers/resend-mail.provider';
import { HTTP_CLIENT } from './http/http-client.interface';
import { FetchHttpClient } from './http/fetch-http.client';

@Module({
  controllers: [IntegrationsController, MailOutboxController],
  providers: [
    IntegrationsService,
    IntegrationsRepository,
    WebhookDispatcherService,
    WebhookEventHandler,
    MailService,
    SimulatedMailProvider,
    SmtpMailProvider,
    ResendMailProvider,
    // Sélection du fournisseur via MAIL_DRIVER (simulated | smtp | resend).
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService, SimulatedMailProvider, SmtpMailProvider, ResendMailProvider],
      useFactory: (
        config: ConfigService,
        sim: SimulatedMailProvider,
        smtp: SmtpMailProvider,
        resend: ResendMailProvider,
      ) => {
        const driver = config.get<string>('MAIL_DRIVER') ?? 'simulated';
        if (driver === 'smtp') return smtp;
        if (driver === 'resend') return resend;
        return sim;
      },
    },
    { provide: HTTP_CLIENT, useClass: FetchHttpClient },
  ],
  exports: [IntegrationsService, MailService],
})
export class IntegrationsModule {}
