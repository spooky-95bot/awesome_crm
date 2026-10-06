// backend/test/accounting.e2e-spec.ts
// E2E — v3.2 muhasebe: OAuth start/callback (state doğrulamalı) + fatura senkronu.
// Dış HTTP (token + QBO API) stub'lanır → ağa çıkmaz. Negatifler: bağlantı yok 400,
// DRAFT 409, yanlış state, RBAC 403.
process.env.THROTTLE_LIMIT = '1000';
process.env.APP_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EXT_HTTP, ExtHttpResponse } from '../src/common/http/ext-http.client';

const base = '/api/v1';

// Dış HTTP stub'ı: token değişimi + QBO customer/invoice yanıtları.
const extCalls: { method: string; url: string }[] = [];
const extStub = {
  request: (method: string, url: string): Promise<ExtHttpResponse> => {
    extCalls.push({ method, url });
    if (url.includes('oauth2/v1/tokens')) {
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({
          access_token: 'qbo-access-STUB',
          refresh_token: 'qbo-refresh-STUB',
          expires_in: 3600,
        }),
      });
    }
    if (url.includes('/customer')) {
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({ Customer: { Id: 'CUST-77' } }),
      });
    }
    if (url.includes('/invoice')) {
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({ Invoice: { Id: 'QBO-INV-42' } }),
      });
    }
    return Promise.resolve({ status: 404, body: '{}' });
  },
};

describe('Accounting sync + OAuth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let connId: string;
  let invoiceId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `acc_sales_${ts}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (e: string, p: string) =>
    request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email: e, password: p });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EXT_HTTP)
      .useValue(extStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    adminToken = (await login(adminEmail, adminPw).expect(200)).body.data
      .accessToken;
    const roles = await request(app.getHttpServer())
      .get(`${base}/roles`)
      .set(auth(adminToken))
      .expect(200);
    for (const r of roles.body.data) roleId[r.name] = r.id;
    const res = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set(auth(adminToken))
      .send({
        email: salesEmail,
        password: pw,
        firstName: 'A',
        lastName: 'C',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;

    // Test faturası (DRAFT).
    const inv = await request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set(auth(adminToken))
      .send({
        customerName: `AccCo_${ts}`,
        taxRate: '20',
        lineItems: [
          { description: 'Hizmet', quantity: '1', unitPrice: '1000' },
        ],
      })
      .expect(201);
    invoiceId = inv.body.data.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.accountingSync.deleteMany({ where: { invoiceId } });
      await prisma.payment.deleteMany({ where: { invoiceId } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId } });
      await prisma.connection.deleteMany({
        where: { provider: 'quickbooks' },
      });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('bağlı muhasebe yokken sync → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/accounting/invoices/${invoiceId}/sync`)
      .set(auth(adminToken))
      .expect(400));

  it('quickbooks bağla → status pending_auth', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({
        provider: 'quickbooks',
        secrets: { clientSecret: 'cs-STUB' },
        config: { clientId: 'ci-STUB' },
      })
      .expect(201);
    connId = r.body.data.id;
    expect(r.body.data.status).toBe('pending_auth');
  });

  it('SALES oauth/start → 403; ADMIN → authorize URL + state', async () => {
    await request(app.getHttpServer())
      .get(`${base}/connections/${connId}/oauth/start`)
      .set(auth(salesToken))
      .expect(403);
    const r = await request(app.getHttpServer())
      .get(`${base}/connections/${connId}/oauth/start`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.url).toContain('appcenter.intuit.com');
    expect(r.body.data.url).toContain('client_id=ci-STUB');
    expect(r.body.data.url).toContain('state=');
  });

  it('callback yanlış state → invalid_state yönlendirmesi, bağlantı pending kalır', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/connections/oauth/callback?code=abc&state=WRONG`)
      .expect(302);
    expect(r.headers.location).toContain('oauth=invalid_state');
    const row = await prisma.connection.findFirst({ where: { id: connId } });
    expect(row?.status).toBe('pending_auth');
  });

  it('callback doğru state → connected; token şifreli, düz metin YOK', async () => {
    const row = await prisma.connection.findFirst({ where: { id: connId } });
    const state = (row?.config as { oauthState?: string })?.oauthState;
    expect(state).toBeTruthy();

    const r = await request(app.getHttpServer())
      .get(
        `${base}/connections/oauth/callback?code=authcode&state=${state}&realmId=RLM1`,
      )
      .expect(302);
    expect(r.headers.location).toContain('connected=quickbooks');

    const after = await prisma.connection.findFirst({ where: { id: connId } });
    expect(after?.status).toBe('connected');
    expect((after?.config as { realmId?: string })?.realmId).toBe('RLM1');
    // Token DB'de düz görünmemeli (AES-256-GCM şifreli).
    expect(after?.secretsEnc).not.toContain('qbo-access-STUB');
  });

  it('DRAFT fatura sync → 409', () =>
    request(app.getHttpServer())
      .post(`${base}/accounting/invoices/${invoiceId}/sync`)
      .set(auth(adminToken))
      .expect(409));

  it('issue + sync → SYNCED + externalId; durum ucu döner', async () => {
    await request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/issue`)
      .set(auth(adminToken))
      .expect(200);

    const r = await request(app.getHttpServer())
      .post(`${base}/accounting/invoices/${invoiceId}/sync`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.status).toBe('SYNCED');
    expect(r.body.data.externalId).toBe('QBO-INV-42');
    // Stub'a customer + invoice çağrıları gitti
    expect(extCalls.some((c) => c.url.includes('/customer'))).toBe(true);
    expect(extCalls.some((c) => c.url.includes('/invoice'))).toBe(true);

    const st = await request(app.getHttpServer())
      .get(`${base}/accounting/invoices/${invoiceId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(st.body.data.status).toBe('SYNCED');
  });
});
