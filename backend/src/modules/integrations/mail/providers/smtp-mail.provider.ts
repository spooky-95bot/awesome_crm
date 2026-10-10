// src/modules/integrations/mail/providers/smtp-mail.provider.ts
// Production : SMTP réel via nodemailer. Identifiants depuis .env (SMTP_*).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { IMailProvider, MailInput } from '../mail-provider.interface';
import { renderTemplate } from '../mail-templates';

@Injectable()
export class SmtpMailProvider implements IMailProvider {
  readonly driver = 'smtp';
  private readonly logger = new Logger(SmtpMailProvider.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST', 'localhost'),
        port: this.config.get<number>('SMTP_PORT', 1025),
        secure: this.config.get<boolean>('SMTP_SECURE', false),
        auth: this.config.get<string>('SMTP_USER')
          ? {
              user: this.config.get<string>('SMTP_USER'),
              pass: this.config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(input: MailInput): Promise<void> {
    const { text } = renderTemplate(input.template, input.context);
    await this.getTransporter().sendMail({
      from: this.config.get<string>('SMTP_FROM', 'crm@localhost'),
      to: input.to,
      subject: input.subject,
      text,
    });
    this.logger.log(`SMTP mail envoyé template=${input.template}`);
  }
}
