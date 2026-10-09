// src/modules/integrations/mail/providers/simulated-mail.provider.ts
// Développement/test : n'envoie RIEN réellement ; rend le modèle et journalise. EmailLog est écrit par MailService.
import { Injectable, Logger } from '@nestjs/common';
import { IMailProvider, MailInput } from '../mail-provider.interface';

@Injectable()
export class SimulatedMailProvider implements IMailProvider {
  readonly driver = 'simulated';
  private readonly logger = new Logger(SimulatedMailProvider.name);

  async send(input: MailInput): Promise<void> {
    // Aucun envoi réel. Aucune donnée personnelle n'est journalisée ; uniquement des métadonnées.
    this.logger.log(
      `[SIMULATED] mail template=${input.template} to=${maskEmail(input.to)}`,
    );
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, 1);
  return `${head}***@${domain}`;
}
