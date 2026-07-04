// backend/test/growth.e2e-spec.ts
// E2E — v4.5 360° büyüme: sinyaller, playbook (AI yok → fallback), RBAC.
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

describe('Growth 360 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let brandId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const finEmail = `gr_fin_${ts}@crm.dev`;
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
        email: finEmail,
        password: pw,
        firstName: 'G',
        lastName: 'R',
        roleIds: [roleId.FINANCE],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    financeToken = (await login(finEmail, pw).expect(200)).body.data
      .accessToken;

    const brand = await request(app.getHttpServer())
      .post(`${base}/brands`)
      .set(auth(adminToken))
      .send({
        name: `GrBrand_${ts}`,
        niche: 'Erkek sokak giyimi',
        priceBand: 'mid',
      })
      .expect(201);
    brandId = brand.body.data.id;
    // Fiyat sinyali oluştur
    await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/products/import-csv`)
      .set(auth(adminToken))
      .send({ csv: 'name,price,currency\nA,100,TRY\nB,300,TRY' })
      .expect(200);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.competitorProduct.deleteMany({ where: { brandId } });
      if (brandId) await prisma.brand.deleteMany({ where: { id: brandId } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('FINANCE signals → 403', () =>
    request(app.getHttpServer())
      .get(`${base}/brands/${brandId}/signals`)
      .set(auth(financeToken))
      .expect(403));

  it('signals → rakip/ürün/fiyat toplulaştırması', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/brands/${brandId}/signals`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.products).toBe(2);
    expect(r.body.data.avgPrice).toBe(200);
    expect(r.body.data.minPrice).toBe(100);
    expect(r.body.data.maxPrice).toBe(300);
  });

  it('playbook (AI yok) → fallback, aiUsed=false + fiyat içgörüsü', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/playbook`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.aiUsed).toBe(false);
    expect(typeof r.body.data.positioning).toBe('string');
    expect(r.body.data.pricingInsight).toContain('200');
    expect(Array.isArray(r.body.data.nextActions)).toBe(true);
    expect(r.body.data.nextActions.length).toBeGreaterThan(0);
  });
});
