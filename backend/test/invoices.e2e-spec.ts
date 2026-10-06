// backend/test/invoices.e2e-spec.ts
// Faz 4 E2E — Finans: maskeleme, immutability, ödeme akışı, sıralı numara, aşırı ödeme.
// GEREKSİNİM: çalışan test DB + seed. Çalıştırma: npm run test:e2e
process.env.THROTTLE_LIMIT = '1000';

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

const base = '/api/v1';

describe('Invoices / Finance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let financeToken: string;
  let salesToken: string;
  let financeId: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const financeEmail = `fin_${ts}@crm.dev`;
  const salesEmail = `inv_sales_${ts}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email, password });

  const invoiceBody = (over: Record<string, unknown> = {}) => ({
    customerName: 'ACME A.Ş.',
    taxRate: '20',
    lineItems: [
      { description: 'Danışmanlık', quantity: '2', unitPrice: '1500.00' },
    ],
    ...over,
  });

  const createInvoice = async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set(auth(financeToken))
      .send(invoiceBody())
      .expect(201);
    return r.body.data.id as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

    const adminToken = (await login(adminEmail, adminPw).expect(200)).body.data
      .accessToken;
    const roles = await request(app.getHttpServer())
      .get(`${base}/roles`)
      .set(auth(adminToken))
      .expect(200);
    for (const r of roles.body.data) roleId[r.name] = r.id;

    const mkUser = async (email: string, role: string) => {
      const res = await request(app.getHttpServer())
        .post(`${base}/users`)
        .set(auth(adminToken))
        .send({
          email,
          password: pw,
          firstName: 'F',
          lastName: 'T',
          roleIds: [roleId[role]],
        })
        .expect(201);
      testUserIds.push(res.body.data.id);
      return res.body.data.id;
    };
    financeId = await mkUser(financeEmail, 'FINANCE');
    await mkUser(salesEmail, 'SALES');
    financeToken = (await login(financeEmail, pw).expect(200)).body.data
      .accessToken;
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.invoice.deleteMany({ where: { createdById: financeId } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  let invoiceId: string;

  // E-4.1
  it('E-4.1 FINANCE POST /invoices → 201 DRAFT, sunucu toplamı', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set(auth(financeToken))
      .send(invoiceBody())
      .expect(201);
    invoiceId = r.body.data.id;
    expect(r.body.data.status).toBe('DRAFT');
    expect(r.body.data.subtotal).toBe('3000');
    expect(r.body.data.taxAmount).toBe('600');
    expect(r.body.data.total).toBe('3600');
  });

  // E-4.6 — istemci 'total' gönderemez (mass assignment/whitelist)
  it('E-4.6 sahte total alanı → 400 (sunucu hesabı otoriter)', () =>
    request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set(auth(financeToken))
      .send(invoiceBody({ total: '1' }))
      .expect(400));

  // S-4.3 — negatif/manipüle quantity
  it('S-4.3 negatif quantity → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set(auth(financeToken))
      .send(
        invoiceBody({
          lineItems: [{ description: 'X', quantity: '-1', unitPrice: '10' }],
        }),
      )
      .expect(400));

  // E-4.2 / S-4.1 — SALES maskeli görür
  it('E-4.2 SALES GET /invoices → 200 ama tutar alanları YOK', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/invoices`)
      .set(auth(salesToken))
      .expect(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    const inv = r.body.data.find((i: { id: string }) => i.id === invoiceId);
    expect(inv).toBeDefined();
    expect(inv.customerName).toBe('ACME A.Ş.');
    expect(inv.total).toBeUndefined();
    expect(inv.amountPaid).toBeUndefined();
    expect(inv.lineItems).toBeUndefined();
  });

  // E-4.3 — FINANCE tutarları görür
  it('E-4.3 FINANCE GET /invoices/:id → tutarlar görünür', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/invoices/${invoiceId}`)
      .set(auth(financeToken))
      .expect(200);
    expect(r.body.data.total).toBe('3600');
    expect(Array.isArray(r.body.data.lineItems)).toBe(true);
  });

  // E-4.4 — SALES ödeme kaydedemez
  it('E-4.4 SALES POST /invoices/:id/payments → 403', () =>
    request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/payments`)
      .set(auth(salesToken))
      .send({ amount: '100', method: 'BANK' })
      .expect(403));

  // E-4.5 — issue sonrası update reddedilir (immutability)
  it('E-4.5 issue → SENT + sıralı numara; sonra PATCH → 409', async () => {
    const issued = await request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/issue`)
      .set(auth(financeToken))
      .expect(200);
    expect(issued.body.data.status).toBe('SENT');
    expect(issued.body.data.number).toMatch(/^INV-\d{4}-\d{6}$/);

    await request(app.getHttpServer())
      .patch(`${base}/invoices/${invoiceId}`)
      .set(auth(financeToken))
      .send({ customerName: 'Değişti' })
      .expect(409);
  });

  // Ödeme akışı: kısmi → PARTIALLY_PAID → tam → PAID; sonra aşırı → 400
  it('ödeme akışı: kısmi → tam → PAID; aşırı ödeme 400', async () => {
    const partial = await request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/payments`)
      .set(auth(financeToken))
      .send({ amount: '1000.00', method: 'BANK' })
      .expect(200);
    expect(partial.body.data.status).toBe('PARTIALLY_PAID');
    expect(partial.body.data.amountPaid).toBe('1000');

    const full = await request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/payments`)
      .set(auth(financeToken))
      .send({ amount: '2600.00', method: 'CARD' })
      .expect(200);
    expect(full.body.data.status).toBe('PAID');

    // Aşırı ödeme (PAID üzerine) → 400
    await request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/payments`)
      .set(auth(financeToken))
      .send({ amount: '1', method: 'CASH' })
      .expect(400);
  });

  // PAID fatura iptal edilemez
  it('PAID fatura cancel → 409', () =>
    request(app.getHttpServer())
      .post(`${base}/invoices/${invoiceId}/cancel`)
      .set(auth(financeToken))
      .expect(409));

  // C-4.1 — paralel issue: benzersiz, sıralı numara (atlama/çakışma yok)
  it('C-4.1 paralel issue → benzersiz sıralı numaralar', async () => {
    const a = await createInvoice();
    const b = await createInvoice();
    const [ra, rb] = await Promise.all([
      request(app.getHttpServer())
        .post(`${base}/invoices/${a}/issue`)
        .set(auth(financeToken))
        .expect(200),
      request(app.getHttpServer())
        .post(`${base}/invoices/${b}/issue`)
        .set(auth(financeToken))
        .expect(200),
    ]);
    const na = ra.body.data.number;
    const nb = rb.body.data.number;
    expect(na).not.toBe(nb);
    expect(na).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(nb).toMatch(/^INV-\d{4}-\d{6}$/);
  });

  // Cancel akışı: DRAFT iptal edilebilir
  it('DRAFT fatura cancel → CANCELLED', async () => {
    const id = await createInvoice();
    const r = await request(app.getHttpServer())
      .post(`${base}/invoices/${id}/cancel`)
      .set(auth(financeToken))
      .expect(200);
    expect(r.body.data.status).toBe('CANCELLED');
  });
});
