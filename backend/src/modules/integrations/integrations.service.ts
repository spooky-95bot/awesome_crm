// src/modules/integrations/integrations.service.ts
// İŞ MANTIĞI: webhook abonelik yönetimi, SSRF kontrolü, gelen webhook doğrulama.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { IntegrationsRepository } from './integrations.repository';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { isSafeWebhookUrl } from './util/ssrf.util';
import { verifySignature } from './util/webhook-signature.util';
import { CreateWebhookDto } from './dto/create-webhook.dto';

interface SubscriptionRow {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly allowPrivate: boolean;

  constructor(
    private readonly repo: IntegrationsRepository,
    private readonly dispatcher: WebhookDispatcherService,
    private readonly config: ConfigService,
  ) {
    // Test/self-host: özel ağ + http webhook'a izin (varsayılan kapalı).
    this.allowPrivate = config.get<boolean>('WEBHOOK_ALLOW_PRIVATE', false);
  }

  async createWebhook(dto: CreateWebhookDto, actor: AuthenticatedUser) {
    // SSRF + HTTPS zorunluluğu.
    if (!isSafeWebhookUrl(dto.url, { allowPrivate: this.allowPrivate })) {
      throw new BadRequestException(
        'Geçersiz webhook URL (yalnız HTTPS, iç/özel adresler yasak).',
      );
    }
    // Secret sunucuda üretilir; istemciden alınmaz.
    const secret = randomBytes(32).toString('hex');
    const sub = await this.repo.createSubscription({
      url: dto.url,
      events: dto.events,
      secret,
      createdById: actor.id,
    });
    this.logger.log(`webhook.create by=${actor.id} sub=${sub.id}`); // secret loglanmaz
    // Secret YALNIZ burada, bir kez döner.
    return { ...this.toView(sub), secret };
  }

  async listWebhooks() {
    const subs = await this.repo.listSubscriptions();
    return subs.map((s) => this.toView(s));
  }

  async deleteWebhook(id: string) {
    await this.getSubOrThrow(id);
    await this.repo.deleteSubscription(id);
    return { deleted: true };
  }

  async testWebhook(id: string, actor: AuthenticatedUser) {
    const sub = await this.getSubOrThrow(id);
    const delivery = await this.dispatcher.dispatch(sub, 'webhook.test', {
      test: true,
      triggeredBy: actor.id,
    });
    return { deliveryId: delivery.id, status: delivery.status };
  }

  async listDeliveries(id: string) {
    await this.getSubOrThrow(id);
    return this.repo.listDeliveries(id);
  }

  // Gelen webhook: imza zorunlu (yetki imzayla). İmzasız/yanlış → 401.
  async handleInbound(params: {
    source: string;
    rawBody: string;
    signature?: string;
    timestamp?: string;
    deliveryId?: string;
  }) {
    const secret = this.config.get<string>('INBOUND_WEBHOOK_SECRET');
    if (!secret) {
      throw new BadRequestException('Webhook entrant non configuré.');
    }
    if (!params.signature || !params.timestamp) {
      throw new UnauthorizedException('Signature requise.');
    }
    const ok = verifySignature({
      secret,
      timestamp: Number(params.timestamp),
      body: params.rawBody,
      signature: params.signature,
      nowSec: Math.floor(Date.now() / 1000),
    });
    if (!ok) {
      throw new UnauthorizedException('Signature invalide.');
    }

    // Idempotency: aynı delivery daha önce işlendiyse tekrar işleme yok.
    const key = `${params.source}:${params.deliveryId ?? params.signature}`;
    const seen = await this.repo.findProcessed(key);
    if (seen) {
      return { received: true, duplicate: true };
    }
    await this.repo.createProcessed(key, params.source);
    this.logger.log(`inbound webhook source=${params.source} processed`);
    return { received: true, duplicate: false };
  }

  // --- Yardımcılar ---

  private async getSubOrThrow(id: string) {
    const sub = await this.repo.findSubscriptionById(id);
    if (!sub) {
      throw new NotFoundException('Abonnement webhook introuvable');
    }
    return sub;
  }

  // Secret ASLA görünüme dahil edilmez.
  private toView(s: SubscriptionRow) {
    return {
      id: s.id,
      url: s.url,
      events: s.events,
      isActive: s.isActive,
      createdAt: s.createdAt,
    };
  }
}
