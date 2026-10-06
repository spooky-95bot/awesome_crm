// backend/test/tenant.e2e-spec.ts
// Faz 6 E2E — Multi-tenancy: x-tenant-id bağlamı + merkezi otomatik filtre (Deal dilimi).
// T-6.1 izolasyon, T-6.2 cross-tenant erişim engeli, T-6.3 otomatik tenantId atama.
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

describe('Multi-tenancy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  let pipelineId: string;
  let stageNew: string;
  const ts = Date.now();
  const tenantA = `tenant-a-${ts}`;
  const tenantB = `tenant-b-${ts}`;
  let dealA: string;
  let dealB: string;

  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;
  const authA = { Authorization: '', 'x-tenant-id': tenantA };

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
    authA.Authorization = `Bearer ${adminToken}`;

    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    pipelineId = pipeline.id;
    stageNew = pipeline.stages[0].id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.deal.deleteMany({
        where: { tenantId: { in: [tenantA, tenantB] } },
      });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  const createDealFor = (tenant: string, title: string) =>
    request(app.getHttpServer())
      .post(`${base}/deals`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenant)
      .send({ pipelineId, stageId: stageNew, title })
      .expect(201);

  // T-6.3 — create sırasında tenantId otomatik atanır
  it('T-6.3 create: tenantId otomatik atanır (merkezi middleware)', async () => {
    dealA = (await createDealFor(tenantA, 'A-Deal')).body.data.id;
    dealB = (await createDealFor(tenantB, 'B-Deal')).body.data.id;

    // Bağlamsız doğrudan okuma: kayıtların tenantId'si doğru
    const a = await prisma.deal.findUnique({ where: { id: dealA } });
    const b = await prisma.deal.findUnique({ where: { id: dealB } });
    expect(a?.tenantId).toBe(tenantA);
    expect(b?.tenantId).toBe(tenantB);
  });

  // T-6.1 — tenant A yalnız kendi deal'lerini görür
  it("T-6.1 GET /deals (tenant A) → yalnız A deal'leri", async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/deals?pipelineId=${pipelineId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantA)
      .expect(200);
    const ids = r.body.data.map((l: { id: string }) => l.id);
    expect(ids).toContain(dealA);
    expect(ids).not.toContain(dealB);
  });

  it("GET /deals (tenant B) → yalnız B deal'leri", async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/deals?pipelineId=${pipelineId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantB)
      .expect(200);
    const ids = r.body.data.map((l: { id: string }) => l.id);
    expect(ids).toContain(dealB);
    expect(ids).not.toContain(dealA);
  });

  // T-6.2 — cross-tenant erişim engeli
  it('T-6.2 tenant B token ile A deal :id → 404', () =>
    request(app.getHttpServer())
      .get(`${base}/deals/${dealA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantB)
      .expect(404));

  it('tenant A kendi deal :id → 200', () =>
    request(app.getHttpServer())
      .get(`${base}/deals/${dealA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantA)
      .expect(200));

  // Invoice de tenant kapsamında (TENANT_MODELS genişletildi)
  it('Invoice tenant izolasyonu: A faturası B listesinde görünmez', async () => {
    const inv = await request(app.getHttpServer())
      .post(`${base}/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantA)
      .send({
        customerName: 'Tenant-A Müşteri',
        taxRate: '20',
        lineItems: [{ description: 'X', quantity: '1', unitPrice: '100' }],
      })
      .expect(201);
    const invId = inv.body.data.id;

    const listB = await request(app.getHttpServer())
      .get(`${base}/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', tenantB)
      .expect(200);
    expect(listB.body.data.map((i: { id: string }) => i.id)).not.toContain(
      invId,
    );

    // Temizlik
    await prisma.invoice.deleteMany({ where: { tenantId: tenantA } });
  });
});
