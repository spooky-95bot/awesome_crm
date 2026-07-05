// backend/test/payments.e2e-spec.ts
// E2E — v4.6 iyzico ödeme: bağlı değil 400, RBAC 403, form başlat (EXT_HTTP stub),
// callback → sunucu doğrulama → fatura PAID, idempotent çift callback, başarısızlık.
process.env.THROTTLE_LIMIT = '1000';
process.env.APP_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.APP_PUBLIC_URL = 'https://crm.test.local';

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

// iyzico dış API stub'ı: initialize → token; detail → SUCCESS (forceFail ile FAILURE).
// capturedPrice ile initialize'daki paidPrice detail'e yansıtılır (tutar eşleşmesi testi).
let capturedPrice = '0';
let forceFail = false;
const extStub = {
  request: (
    _m: string,
    url: string,
    body: string | null,
  ): Promise<ExtHttpResponse> => {
    if (url.includes('/checkoutform/initialize/')) {
      const parsed = JSON.parse(body ?? '{}') as {
        basketId: string;
        paidPrice: string;
      };
      capturedPrice = parsed.paidPrice;
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({
          status: 'success',
          token: `tok_${parsed.basketId}`,
          paymentPageUrl: 'https://sandbox-cf.iyzipay.com/pay/tok',
          checkoutFormContent: '<script>iyziInit()</script>',
          tokenExpireTime: 1800,
        }),
      });
    }
    if (url.includes('/checkoutform/auth/ecom/detail')) {
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({
          status: 'success',
          paymentStatus: forceFail ? 'FAILURE' : 'SUCCESS',
          paidPrice: capturedPrice,
          paymentId: 'pay_12345',
        }),
      });
    }
    return Promise.resolve({ status: 404, body: '{}' });
  },
};

describe('Payments iyzico (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let invoiceId: string;
  let total = '';

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `pay_sales_${ts}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@crm.dev';
  const adminPw = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';
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
    app = moduleRef.createNestApplication({ rawBody: true });
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
        firstName: 'P',
        lastName: 'S',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;

    // Fatura oluştur + issue → SENT (tahsil edilebilir).
    const inv = await request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set(auth(adminToken))
      .send({
        customerName: 'Ahmet Yılmaz',
        taxRate: '20',
        lineItems: [
          { description: 'Danışmanlık', quantity: '1', unitPrice: '1000' },
        ],
      })
      .expect(201);
    invoiceId = inv.body.data.id;
    total = inv.body.data.total;
    await request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/issue`)
      .set(auth(adminToken))
      .expect(200);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.paymentIntent.deleteMany({ where: { invoiceId } });
      await prisma.payment.deleteMany({ where: { invoiceId } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId } });
      await prisma.connection.deleteMany({ where: { provider: 'iyzico' } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('iyzico bağlı değilken başlat → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/pay/iyzico`)
      .set(auth(adminToken))
      .send({})
      .expect(400));

  it('iyzico bağla (kimlik doğrulama sırları şifreli)', () =>
    request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({
        provider: 'iyzico',
        secrets: { apiKey: 'sandbox-key', secretKey: 'sandbox-secret' },
        config: { baseUrl: 'https://sandbox-api.iyzipay.com' },
      })
      .expect(201));

  it('SALES başlat → 403 (read_financial yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/pay/iyzico`)
      .set(auth(salesToken))
      .send({})
      .expect(403));

  it('başlat → token + paymentPageUrl döner', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/pay/iyzico`)
      .set(auth(adminToken))
      .send({ buyerName: 'Ahmet Yılmaz', identityNumber: '11111111111' })
      .expect(200);
    expect(r.body.data.token).toBe(`tok_${invoiceId}`);
    expect(r.body.data.paymentPageUrl).toContain('iyzipay.com');
  });

  it('callback → sunucu doğrulama → fatura PAID (302 success)', async () => {
    const cb = await request(app.getHttpServer())
      .post(`${base}/webhooks/iyzico/callback`)
      .type('form')
      .send({ token: `tok_${invoiceId}` })
      .expect(302);
    expect(cb.headers.location).toContain('payment=success');

    const inv = await request(app.getHttpServer())
      .get(`${base}/invoices/${invoiceId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(inv.body.data.status).toBe('PAID');
    expect(inv.body.data.amountPaid).toBe(total);
    expect(inv.body.data.payments.length).toBe(1);
    expect(inv.body.data.payments[0].method).toBe('CARD');
  });

  it('çift callback → idempotent (tek ödeme, tekrar PAID)', async () => {
    await request(app.getHttpServer())
      .post(`${base}/webhooks/iyzico/callback`)
      .type('form')
      .send({ token: `tok_${invoiceId}` })
      .expect(302);
    const inv = await request(app.getHttpServer())
      .get(`${base}/invoices/${invoiceId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(inv.body.data.amountPaid).toBe(total);
    expect(inv.body.data.payments.length).toBe(1); // çift kayıt YOK
  });

  it('bilinmeyen token → 302 failed (yazım yok)', async () => {
    const cb = await request(app.getHttpServer())
      .post(`${base}/webhooks/iyzico/callback`)
      .type('form')
      .send({ token: 'tok_yok' })
      .expect(302);
    expect(cb.headers.location).toContain('payment=failed');
  });

  it('iyzico FAILURE → fatura ödenmez (302 failed)', async () => {
    // Yeni fatura + başlat, sonra detail FAILURE dönsün.
    const inv2 = await request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set(auth(adminToken))
      .send({
        customerName: 'Fail Test',
        taxRate: '0',
        lineItems: [{ description: 'X', quantity: '1', unitPrice: '50' }],
      })
      .expect(201);
    const id2 = inv2.body.data.id;
    await request(app.getHttpServer())
      .post(`${base}/invoices/${id2}/issue`)
      .set(auth(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .post(`${base}/invoices/${id2}/pay/iyzico`)
      .set(auth(adminToken))
      .send({})
      .expect(200);

    forceFail = true;
    try {
      const cb = await request(app.getHttpServer())
        .post(`${base}/webhooks/iyzico/callback`)
        .type('form')
        .send({ token: `tok_${id2}` })
        .expect(302);
      expect(cb.headers.location).toContain('payment=failed');
    } finally {
      forceFail = false;
    }
    const check = await request(app.getHttpServer())
      .get(`${base}/invoices/${id2}`)
      .set(auth(adminToken))
      .expect(200);
    expect(check.body.data.status).not.toBe('PAID');
    expect(check.body.data.payments.length).toBe(0);

    // temizle
    await prisma.paymentIntent.deleteMany({ where: { invoiceId: id2 } });
    await prisma.invoice.deleteMany({ where: { id: id2 } });
  });
});
