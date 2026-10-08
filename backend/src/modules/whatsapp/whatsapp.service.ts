// src/modules/whatsapp/whatsapp.service.ts
// İŞ MANTIĞI: WhatsApp Cloud API üzerinden metin gönderimi + gelen webhook işleme.
// Kimlik bilgileri v3.0 Connections'tan (şifreli) çözülür; bağlı değilse anlaşılır hata.
// Gelen webhook: X-Hub-Signature-256 (HMAC-SHA256, appSecret) DOĞRULANMADAN DB yazımı YOK.
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConnectionsService } from '../connections/connections.service';
import { WhatsAppRepository } from './whatsapp.repository';
import { IGraphClient, WA_GRAPH_CLIENT } from './graph-client';

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

export interface SendInput {
  to: string;
  body: string;
  leadId?: string | null;
  contactId?: string | null;
}

interface InboundMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly repo: WhatsAppRepository,
    private readonly connections: ConnectionsService,
    @Inject(WA_GRAPH_CLIENT) private readonly graph: IGraphClient,
  ) {}

  async status() {
    const creds = await this.connections.getCredentials('whatsapp');
    return { connected: !!creds };
  }

  // Metin mesajı gönder; sonuç (sent/failed) her durumda kayda geçer.
  async send(input: SendInput) {
    const creds = await this.connections.getCredentials('whatsapp');
    if (!creds) {
      throw new BadRequestException(
        'WhatsApp bağlı değil — Bağlantılar sayfasından bağlayın.',
      );
    }
    const to = this.digits(input.to);
    if (!to || input.body.trim().length === 0) {
      throw new BadRequestException('Un téléphone et un message valides sont requis.');
    }

    let status = 'sent';
    let error: string | null = null;
    let waId: string | null = null;
    try {
      const res = await this.graph.post(
        `${GRAPH_BASE}/${String(creds.config.phoneNumberId)}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: input.body },
        },
        { Authorization: `Bearer ${creds.secrets.accessToken}` },
      );
      if (res.status >= 200 && res.status < 300) {
        try {
          const parsed = JSON.parse(res.body) as {
            messages?: { id?: string }[];
          };
          waId = parsed.messages?.[0]?.id ?? null;
        } catch {
          waId = null;
        }
      } else {
        status = 'failed';
        error = `HTTP ${res.status}`;
      }
    } catch (e) {
      status = 'failed';
      error = (e as Error).message;
    }

    // Lead/contact verilmediyse telefondan eşle.
    const link = await this.resolveLink(to, input.leadId, input.contactId);
    const msg = await this.repo.createMessage({
      direction: 'OUT',
      phone: to,
      body: input.body,
      status,
      error,
      waId,
      leadId: link.leadId,
      contactId: link.contactId,
    });
    this.logger.log(`whatsapp.send to=${to} status=${status}`);
    return { ok: status === 'sent', message: msg };
  }

  // Sohbet listesi: telefon başına son mesaj + sayaç (JS toplulaştırma; tenant-scope güvenli).
  async conversations() {
    const rows = await this.repo.listAll();
    const map = new Map<
      string,
      {
        phone: string;
        lastBody: string;
        lastAt: Date;
        lastDirection: string;
        count: number;
        leadId: string | null;
        contactId: string | null;
      }
    >();
    for (const m of rows) {
      const cur = map.get(m.phone);
      if (!cur) {
        map.set(m.phone, {
          phone: m.phone,
          lastBody: m.body,
          lastAt: m.createdAt,
          lastDirection: m.direction,
          count: 1,
          leadId: m.leadId,
          contactId: m.contactId,
        });
      } else {
        cur.count += 1;
        // rows desc sıralı → ilk görülen zaten en yeni; sadece link bilgisi tamamla.
        cur.leadId = cur.leadId ?? m.leadId;
        cur.contactId = cur.contactId ?? m.contactId;
      }
    }
    return [...map.values()].sort(
      (a, b) => b.lastAt.getTime() - a.lastAt.getTime(),
    );
  }

  thread(phone: string) {
    return this.repo.thread(this.digits(phone));
  }

  // Meta webhook doğrulama challenge'ı (GET). Token eşleşmezse 401.
  async verifyChallenge(mode?: string, token?: string, challenge?: string) {
    const creds = await this.connections.getCredentials('whatsapp');
    const expected = creds?.secrets.verifyToken;
    if (
      mode !== 'subscribe' ||
      !expected ||
      !token ||
      token !== expected ||
      !challenge
    ) {
      throw new UnauthorizedException('Validation échouée.');
    }
    return challenge;
  }

  // Gelen mesaj webhook'u — imza zorunlu (docs/90).
  async handleInbound(rawBody: string, signature?: string) {
    const creds = await this.connections.getCredentials('whatsapp');
    const appSecret = creds?.secrets.appSecret;
    if (!creds || !appSecret) {
      // Bağlantı/appSecret yoksa inbound kabul edilmez (secure by default).
      throw new UnauthorizedException('Réception WhatsApp non configurée.');
    }
    if (!this.verifySignature(appSecret, rawBody, signature)) {
      throw new UnauthorizedException('Signature invalide.');
    }

    let payload: {
      entry?: {
        changes?: { value?: { messages?: InboundMessage[] } }[];
      }[];
    };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      throw new BadRequestException("Le corps n'est pas du JSON.");
    }

    let stored = 0;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          if (!msg.from) continue;
          const phone = this.digits(msg.from);
          const body =
            msg.text?.body ?? `[${msg.type ?? 'unsupported'} mesajı]`;
          const link = await this.resolveLink(phone);
          await this.repo.createMessage({
            direction: 'IN',
            phone,
            body,
            status: 'received',
            waId: msg.id ?? null,
            leadId: link.leadId,
            contactId: link.contactId,
            tenantId: null,
          });
          stored += 1;
        }
      }
    }
    this.logger.log(`whatsapp.inbound stored=${stored}`);
    return { received: true, stored };
  }

  // --- yardımcılar ---

  private verifySignature(
    appSecret: string,
    rawBody: string,
    signature?: string,
  ): boolean {
    if (!signature || !signature.startsWith('sha256=')) return false;
    const expected =
      'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async resolveLink(
    phone: string,
    leadId?: string | null,
    contactId?: string | null,
  ): Promise<{ leadId: string | null; contactId: string | null }> {
    if (leadId || contactId) {
      return { leadId: leadId ?? null, contactId: contactId ?? null };
    }
    const tail = phone.slice(-10);
    if (tail.length < 7) return { leadId: null, contactId: null };
    const [lead, contact] = await Promise.all([
      this.repo.findLeadByPhoneTail(tail),
      this.repo.findContactByPhoneTail(tail),
    ]);
    return { leadId: lead?.id ?? null, contactId: contact?.id ?? null };
  }

  private digits(v: string): string {
    return (v ?? '').replace(/[^\d]/g, '');
  }
}
