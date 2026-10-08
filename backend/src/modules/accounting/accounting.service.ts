// src/modules/accounting/accounting.service.ts
// İŞ MANTIĞI: kesinleşmiş faturayı bağlı muhasebe sağlayıcısına (QuickBooks/Xero) gönder.
// Token'lar OAuthService'ten taze alınır (otomatik refresh). Sonuç AccountingSync'te izlenir;
// başarısızlık kaydedilir ve aynı uç yeniden denemedir (idempotent upsert).
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { EXT_HTTP, IExtHttpClient } from '../../common/http/ext-http.client';
import { OAuthService } from '../connections/oauth.service';
import { AccountingRepository } from './accounting.repository';

type InvoiceWithItems = Prisma.InvoiceGetPayload<{
  include: { lineItems: true };
}>;

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const XERO_BASE = 'https://api.xero.com/api.xro/2.0';

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private readonly repo: AccountingRepository,
    private readonly oauth: OAuthService,
    @Inject(EXT_HTTP) private readonly http: IExtHttpClient,
  ) {}

  async getSync(invoiceId: string) {
    const sync = await this.repo.findSync(invoiceId);
    return sync ?? { invoiceId, status: 'NONE' };
  }

  async syncInvoice(invoiceId: string) {
    const invoice = await this.repo.findInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('Facture introuvable.');

    // Önce sağlayıcı kontrolü (öncelik: quickbooks → xero) — yoksa net 400.
    const provider = (await this.oauth.getFreshAccessToken('quickbooks'))
      ? 'quickbooks'
      : (await this.oauth.getFreshAccessToken('xero'))
        ? 'xero'
        : null;
    if (!provider) {
      throw new BadRequestException(
        'Bağlı muhasebe sağlayıcısı yok — Bağlantılar sayfasından bağlayın.',
      );
    }

    if (
      invoice.status === InvoiceStatus.DRAFT ||
      invoice.status === InvoiceStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Yalnız kesinleşmiş (DRAFT/CANCELLED olmayan) fatura senkronlanır.',
      );
    }

    const creds = await this.oauth.getFreshAccessToken(provider);
    if (!creds) {
      throw new BadRequestException("Impossible d'obtenir le jeton du fournisseur.");
    }

    try {
      const externalId =
        provider === 'quickbooks'
          ? await this.pushQuickBooks(creds, invoice)
          : await this.pushXero(creds, invoice);
      const sync = await this.repo.upsertSync(invoiceId, {
        provider,
        externalId,
        status: 'SYNCED',
        error: null,
      });
      this.logger.log(
        `accounting.sync invoice=${invoiceId} provider=${provider} ext=${externalId}`,
      );
      return sync;
    } catch (e) {
      const sync = await this.repo.upsertSync(invoiceId, {
        provider,
        status: 'FAILED',
        error: (e as Error).message.slice(0, 500),
      });
      this.logger.warn(
        `accounting.sync FAILED invoice=${invoiceId}: ${(e as Error).message}`,
      );
      return sync;
    }
  }

  // QBO: müşteri oluştur → CustomerRef ile fatura oluştur (iki çağrı).
  private async pushQuickBooks(
    creds: { accessToken: string; config: Record<string, unknown> },
    invoice: InvoiceWithItems,
  ): Promise<string> {
    const realmId = String(creds.config.realmId ?? '');
    if (!realmId) throw new Error('realmId eksik (OAuth yeniden yapılmalı).');
    const headers = {
      Authorization: `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const custRes = await this.http.request(
      'POST',
      `${QBO_BASE}/${realmId}/customer?minorversion=73`,
      JSON.stringify({
        DisplayName: `${invoice.customerName} ${invoice.id.slice(0, 6)}`,
      }),
      headers,
    );
    if (custRes.status < 200 || custRes.status >= 300) {
      throw new Error(`QBO customer HTTP ${custRes.status}`);
    }
    const customerId = (
      JSON.parse(custRes.body) as { Customer?: { Id?: string } }
    ).Customer?.Id;
    if (!customerId) throw new Error('QBO customer id alınamadı.');

    const invRes = await this.http.request(
      'POST',
      `${QBO_BASE}/${realmId}/invoice?minorversion=73`,
      JSON.stringify({
        CustomerRef: { value: customerId },
        DocNumber: invoice.number ?? undefined,
        Line: invoice.lineItems.map((li) => ({
          DetailType: 'SalesItemLineDetail',
          Amount: Number(li.lineTotal),
          Description: li.description,
          SalesItemLineDetail: {
            Qty: Number(li.quantity),
            UnitPrice: Number(li.unitPrice),
          },
        })),
      }),
      headers,
    );
    if (invRes.status < 200 || invRes.status >= 300) {
      throw new Error(`QBO invoice HTTP ${invRes.status}`);
    }
    const extId = (JSON.parse(invRes.body) as { Invoice?: { Id?: string } })
      .Invoice?.Id;
    if (!extId) throw new Error('QBO invoice id alınamadı.');
    return extId;
  }

  // Xero: Contact adıyla tek çağrıda fatura (ACCREC).
  private async pushXero(
    creds: { accessToken: string; config: Record<string, unknown> },
    invoice: InvoiceWithItems,
  ): Promise<string> {
    const res = await this.http.request(
      'PUT',
      `${XERO_BASE}/Invoices`,
      JSON.stringify({
        Invoices: [
          {
            Type: 'ACCREC',
            Contact: { Name: invoice.customerName },
            InvoiceNumber: invoice.number ?? undefined,
            LineItems: invoice.lineItems.map((li) => ({
              Description: li.description,
              Quantity: Number(li.quantity),
              UnitAmount: Number(li.unitPrice),
              AccountCode: '200',
            })),
          },
        ],
      }),
      {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Xero invoice HTTP ${res.status}`);
    }
    const extId = (
      JSON.parse(res.body) as { Invoices?: { InvoiceID?: string }[] }
    ).Invoices?.[0]?.InvoiceID;
    if (!extId) throw new Error('Xero invoice id alınamadı.');
    return extId;
  }
}
