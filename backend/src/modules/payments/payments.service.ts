// src/modules/payments/payments.service.ts
// İŞ MANTIĞI: iyzico Checkout Form ile fatura tahsilatı.
//   initiate  → iyzico'da ödeme formu başlatır (token+paymentPageUrl), PaymentIntent kaydeder.
//   callback  → iyzico tarayıcı redirect'i (İMZASIZ) yalnız token taşır. Gövdeye GÜVENİLMEZ:
//               token ile sunucu-sunucu "retrieve" atılır; iyzico SUCCESS + tutar eşleşirse
//               niyet ATOMİK pending→paid geçer ve TEK Payment düşer (çift callback = no-op).
// Kimlik bilgileri v3.0 Connections'tan (AES-256-GCM şifreli) çözülür; dış çağrılar EXT_HTTP
// (testte stub → e2e offline).
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { EXT_HTTP, IExtHttpClient } from '../../common/http/ext-http.client';
import { iyziAuthHeaders, iyziBaseUrl } from '../../common/http/iyzico-auth';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConnectionsService } from '../connections/connections.service';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentsRepository } from './payments.repository';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

const D = Prisma.Decimal;
const INIT_PATH = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
const DETAIL_PATH = '/payment/iyzipos/checkoutform/auth/ecom/detail';
const PAYABLE = new Set(['SENT', 'PARTIALLY_PAID', 'OVERDUE']);

interface IyzicoInitResponse {
  status?: string;
  errorMessage?: string;
  token?: string;
  paymentPageUrl?: string;
  checkoutFormContent?: string;
  tokenExpireTime?: number;
}

interface IyzicoDetailResponse {
  status?: string;
  paymentStatus?: string;
  paidPrice?: string | number;
  paymentId?: string;
  errorMessage?: string;
}

export interface CallbackResult {
  invoiceId: string | null;
  status: 'success' | 'failed';
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly invoices: InvoicesService,
    private readonly repo: PaymentsRepository,
    private readonly config: ConfigService,
    @Inject(EXT_HTTP) private readonly http: IExtHttpClient,
  ) {}

  // Fatura için iyzico ödeme formu başlat.
  async initiate(
    invoiceId: string,
    dto: InitiatePaymentDto,
    actor: AuthenticatedUser,
    ip: string,
  ) {
    const creds = await this.connections.getCredentials('iyzico');
    if (!creds) {
      throw new BadRequestException(
        'iyzico bağlı değil — Bağlantılar sayfasından bağlayın.',
      );
    }
    const inv = await this.invoices.paymentSnapshot(invoiceId);
    if (!PAYABLE.has(inv.status)) {
      throw new ConflictException(
        'Yalnız gönderilmiş/kısmi ödenmiş fatura tahsil edilebilir.',
      );
    }
    const remaining = inv.remaining;
    if (remaining.lte(0)) {
      throw new BadRequestException('La facture est déjà entièrement payée.');
    }

    const price = remaining.toFixed(2);
    const conversationId = `inv_${invoiceId}_${Date.now()}`;
    const callbackUrl = `${this.publicUrl()}/api/v1/webhooks/iyzico/callback`;
    const [firstName, ...rest] = (
      dto.buyerName ??
      inv.customerName ??
      'Musteri'
    )
      .trim()
      .split(/\s+/);
    const lastName = rest.join(' ') || firstName;
    const email = dto.buyerEmail ?? inv.customerEmail ?? 'noemail@ornek.com';
    const city = dto.city ?? 'Paris';
    const country = dto.country ?? 'France';
    const address = dto.address ?? inv.customerName ?? 'N/A';

    const bodyObj = {
      locale: 'fr',
      conversationId,
      price,
      paidPrice: price,
      currency: inv.currency,
      basketId: invoiceId,
      paymentGroup: 'PRODUCT',
      callbackUrl,
      enabledInstallments: [1, 2, 3, 6, 9],
      buyer: {
        id: invoiceId,
        name: firstName,
        surname: lastName,
        email,
        identityNumber: dto.identityNumber ?? '11111111111',
        registrationAddress: address,
        city,
        country,
        ip,
      },
      shippingAddress: {
        contactName: `${firstName} ${lastName}`,
        city,
        country,
        address,
      },
      billingAddress: {
        contactName: `${firstName} ${lastName}`,
        city,
        country,
        address,
      },
      basketItems: [
        {
          id: invoiceId,
          name: inv.number ? `Fatura ${inv.number}` : 'Fatura',
          category1: 'Invoice',
          itemType: 'VIRTUAL',
          price,
        },
      ],
    };
    const body = JSON.stringify(bodyObj);
    const headers = iyziAuthHeaders(
      creds.secrets.apiKey,
      creds.secrets.secretKey,
      INIT_PATH,
      body,
    );

    const res = await this.http.request(
      'POST',
      iyziBaseUrl(creds.config) + INIT_PATH,
      body,
      headers,
    );
    let parsed: IyzicoInitResponse;
    try {
      parsed = JSON.parse(res.body) as IyzicoInitResponse;
    } catch {
      throw new BadRequestException('Réponse iyzico illisible.');
    }
    if (parsed.status !== 'success' || !parsed.token) {
      throw new BadRequestException(
        `iyzico başlatılamadı: ${parsed.errorMessage ?? 'bilinmeyen hata'}`,
      );
    }

    await this.repo.createIntent({
      invoiceId,
      token: parsed.token,
      conversationId,
      amount: price,
      currency: inv.currency,
      createdById: actor.id,
    });
    this.logger.log(`iyzico.initiate invoice=${invoiceId} token ok`);
    return {
      token: parsed.token,
      paymentPageUrl: parsed.paymentPageUrl ?? null,
      checkoutFormContent: parsed.checkoutFormContent ?? null,
      tokenExpireTime: parsed.tokenExpireTime ?? null,
    };
  }

  // iyzico callback — İMZASIZ token. Gövdeye güvenmeden sunucu-sunucu retrieve ile doğrula.
  async handleCallback(token: string): Promise<CallbackResult> {
    if (!token) return { invoiceId: null, status: 'failed' };
    const intent = await this.repo.findByToken(token);
    if (!intent) return { invoiceId: null, status: 'failed' };
    // Zaten işlenmiş → idempotent.
    if (intent.status === 'paid') {
      return { invoiceId: intent.invoiceId, status: 'success' };
    }
    if (intent.status === 'failed') {
      return { invoiceId: intent.invoiceId, status: 'failed' };
    }

    const creds = await this.connections.getCredentials('iyzico');
    if (!creds) return { invoiceId: intent.invoiceId, status: 'failed' };

    const body = JSON.stringify({
      locale: 'fr',
      conversationId: intent.conversationId,
      token,
    });
    const headers = iyziAuthHeaders(
      creds.secrets.apiKey,
      creds.secrets.secretKey,
      DETAIL_PATH,
      body,
    );
    let detail: IyzicoDetailResponse;
    try {
      const res = await this.http.request(
        'POST',
        iyziBaseUrl(creds.config) + DETAIL_PATH,
        body,
        headers,
      );
      detail = JSON.parse(res.body) as IyzicoDetailResponse;
    } catch {
      // Doğrulama başarısız → niyet pending kalır (tekrar denenebilir); ödeme YAZILMAZ.
      this.logger.warn(`iyzico.callback retrieve failed token=${token}`);
      return { invoiceId: intent.invoiceId, status: 'failed' };
    }

    const ok =
      detail.status === 'success' && detail.paymentStatus === 'SUCCESS';
    const paidOk =
      ok && new D(String(detail.paidPrice ?? '0')).gte(intent.amount);
    if (!ok || !paidOk) {
      await this.repo.markFailed(token, detail.paymentId ?? null);
      this.logger.warn(
        `iyzico.callback not paid token=${token} status=${detail.paymentStatus ?? '?'}`,
      );
      return { invoiceId: intent.invoiceId, status: 'failed' };
    }

    // Yarış-güvenli tek kazanan: pending→paid geçen çağrı Payment kaydını düşer.
    const claimed = await this.repo.claimPaid(token, detail.paymentId ?? null);
    if (claimed) {
      await this.invoices.applyExternalPayment(
        intent.invoiceId,
        intent.amount.toString(),
        {
          method: 'CARD',
          reference: `iyzico:${detail.paymentId ?? token}`,
          recordedById: intent.createdById,
        },
      );
      this.logger.log(`iyzico.callback paid invoice=${intent.invoiceId}`);
    }
    return { invoiceId: intent.invoiceId, status: 'success' };
  }

  listIntents(invoiceId: string) {
    return this.repo.listByInvoice(invoiceId).then((rows) =>
      rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        amount: r.amount.toString(),
        currency: r.currency,
        status: r.status,
        providerRef: r.providerRef,
        createdAt: r.createdAt,
      })),
    );
  }

  private publicUrl(): string {
    return (
      this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }
}
