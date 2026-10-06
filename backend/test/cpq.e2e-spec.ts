// backend/test/cpq.e2e-spec.ts — v2.7 Ürün + Teklif (CPQ) → Fatura akışı.
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

describe('CPQ — ürün/teklif/fatura (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let productId: string;
  let quoteId: string;
  let invoiceId: string;

  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

    adminToken = (
      await request(app.getHttpServer())
        .post(`${base}/auth/login`)
        .send({ email: adminEmail, password: adminPw })
        .expect(200)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      if (quoteId) await prisma.quote.deleteMany({ where: { id: quoteId } });
      if (invoiceId)
        await prisma.invoice.deleteMany({ where: { id: invoiceId } });
      await prisma.product.deleteMany({ where: { name: 'CPQ Lisans' } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('POST /products → 201, Decimal fiyat string', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/products`)
      .set(auth(adminToken))
      .send({ name: 'CPQ Lisans', unitPrice: '1000.00', taxRate: '20' })
      .expect(201);
    productId = r.body.data.id;
    expect(r.body.data.unitPrice).toBe('1000');
  });

  it('POST /quotes: productId kalemi → toplamlar sunucu Decimal', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/quotes`)
      .set(auth(adminToken))
      .send({
        customerName: 'Acme A.Ş.',
        taxRate: '20',
        lineItems: [{ productId, quantity: '2' }],
      })
      .expect(201);
    quoteId = r.body.data.id;
    expect(r.body.data.status).toBe('DRAFT');
    expect(r.body.data.subtotal).toBe('2000'); // 2 × 1000
    expect(r.body.data.taxAmount).toBe('400'); // %20
    expect(r.body.data.total).toBe('2400');
    expect(r.body.data.lineItems[0].description).toBe('CPQ Lisans');
  });

  it('POST /quotes/:id/send → SENT + numara', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/quotes/${quoteId}/send`)
      .set(auth(adminToken))
      .expect(201);
    expect(r.body.data.status).toBe('SENT');
    expect(r.body.data.number).toMatch(/^QUO-\d{4}-\d{6}$/);
  });

  it('POST /quotes/:id/convert → DRAFT fatura üretir', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/quotes/${quoteId}/convert`)
      .set(auth(adminToken))
      .expect(201);
    invoiceId = r.body.data.invoiceId;
    expect(r.body.data.quote.status).toBe('CONVERTED');
    expect(invoiceId).toBeTruthy();

    // Fatura gerçekten oluştu ve toplam eşleşiyor (admin finansal görür).
    const inv = await request(app.getHttpServer())
      .get(`${base}/invoices/${invoiceId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(inv.body.data.status).toBe('DRAFT');
    expect(inv.body.data.total).toBe('2400');
  });

  it('POST /quotes/:id/convert (ikinci kez) → 409 (çift dönüşüm engeli)', () =>
    request(app.getHttpServer())
      .post(`${base}/quotes/${quoteId}/convert`)
      .set(auth(adminToken))
      .expect(409));

  it('DELETE /quotes/:id (CONVERTED) → 409', () =>
    request(app.getHttpServer())
      .delete(`${base}/quotes/${quoteId}`)
      .set(auth(adminToken))
      .expect(409));
});
