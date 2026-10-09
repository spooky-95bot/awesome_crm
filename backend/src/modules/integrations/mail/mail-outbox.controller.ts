// src/modules/integrations/mail/mail-outbox.controller.ts
// Point d'entrée du worker d'envoi. Protégé par un secret partagé.
// Ne renvoie jamais plus que ce que le transport a réellement accepté.
import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { MailService } from './mail.service';

@ApiExcludeController()
@SkipThrottle()
@Controller('mail')
export class MailOutboxController {
  private readonly logger = new Logger(MailOutboxController.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private assertWorkerSecret(provided: string | undefined): void {
    const expected = this.config.get<string>('POLL_SECRET');
    if (!expected || provided !== `Bearer ${expected}`) {
      throw new ForbiddenException('Non autorisé.');
    }
  }

  @Public()
  @Post('process-outbox')
  @HttpCode(HttpStatus.OK)
  async processOutbox(
    @Headers('authorization') auth: string | undefined,
    @Query('limit') limit?: string,
  ): Promise<Record<string, number>> {
    this.assertWorkerSecret(auth);
    const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const summary = await this.mail.processDue(n);
    if (Object.keys(summary).length) {
      this.logger.log(`File e-mail traitée : ${JSON.stringify(summary)}`);
    }
    return summary;
  }
}
