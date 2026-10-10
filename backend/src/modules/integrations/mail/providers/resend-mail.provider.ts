// src/modules/integrations/mail/providers/resend-mail.provider.ts
// Adaptateur Resend derrière IMailProvider. Utilise fetch directement (comme FetchHttpClient)
// car l'interface IHttpClient ne retourne que { status }, alors que Resend nécessite
// le corps de la réponse pour distinguer succès ({ data: { id } }) et erreur ({ error }).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMailProvider, MailInput } from '../mail-provider.interface';
import { renderTemplate } from '../mail-templates';

const RESEND_API_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

@Injectable()
export class ResendMailProvider implements IMailProvider {
  readonly driver = 'resend';
  private readonly logger = new Logger(ResendMailProvider.name);

  constructor(private readonly config: ConfigService) {}

  async send(input: MailInput): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const from = this.config.get<string>('RESEND_FROM');
    if (!from) {
      throw new Error('RESEND_FROM is not configured');
    }

    const { text } = renderTemplate(input.template, input.context);

    const body = JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text,
      reply_to: this.config.get<string>('RESEND_REPLY_TO') || undefined,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      });

      const json = (await res.json().catch(() => null)) as {
        data?: { id?: string };
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        const msg =
          json?.error?.message ??
          `Resend API error (HTTP ${res.status})`;
        this.logger.error(`Resend send failed: ${msg}`);
        throw new Error(msg);
      }

      const id = json?.data?.id ?? 'unknown';
      this.logger.log(`Resend mail sent (id=${id}) template=${input.template}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error('Resend send timed out');
        throw new Error('Resend API timeout');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
