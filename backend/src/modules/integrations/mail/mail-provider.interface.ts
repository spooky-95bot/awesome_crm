// src/modules/integrations/mail/mail-provider.interface.ts
// Abstraction du fournisseur (DIP) : les consommateurs dépendent de l'interface, pas de la classe concrète.
export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailInput {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

export interface IMailProvider {
  readonly driver: string;
  send(input: MailInput): Promise<void>;
}
