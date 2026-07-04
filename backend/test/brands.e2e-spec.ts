// backend/test/brands.e2e-spec.ts
// E2E — v4.0 Marka Radarı: CRUD, RBAC, niş zenginleştirme (AI yok → fallback anahtar kelime).
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

describe('Brands / market radar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let brandId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const finEmail = `brand_fin_${ts}@crm.dev`;
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
        firstName: 'B',
        lastName: 'R',
        roleIds: [roleId.FINANCE],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    financeToken = (await login(finEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      if (brandId) await prisma.brand.deleteMany({ where: { id: brandId } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('FINANCE POST /brands → 403 (brand.manage yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/brands`)
      .set(auth(financeToken))
      .send({ name: 'x' })
      .expect(403));

  it('ADMIN marka oluştur (anket) → 201', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/brands`)
      .set(auth(adminToken))
      .send({
        name: `Sokak_${ts}`,
        sector: 'Giyim',
        niche: 'Erkek sokak giyimi',
        description: 'Oversize tişört ve sokak stili kapüşonlu üreten marka',
        targetAudience: '18-30 erkek',
        priceBand: 'mid',
        markets: ['TR', 'DE'],
        keywords: ['streetwear', 'oversize'],
        knownCompetitors: ['RakipA', 'RakipB'],
      })
      .expect(201);
    brandId = r.body.data.id;
    expect(r.body.data.niche).toBe('Erkek sokak giyimi');
  });

  it('geçersiz priceBand → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/brands`)
      .set(auth(adminToken))
      .send({ name: 'x', priceBand: 'ucuz' })
      .expect(400));

  it('enrich (AI yok) → fallback anahtar kelimeler, aiUsed=false', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/enrich`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.aiUsed).toBe(false);
    expect(Array.isArray(r.body.data.keywords)).toBe(true);
    // açıklamadan/anahtar kelimelerden çıkarım yapıldı
    expect(r.body.data.keywords.length).toBeGreaterThan(0);
    expect(r.body.data.keywords).toEqual(
      expect.arrayContaining(['streetwear']),
    );
  });

  it('GET /brands → oluşturulan görünür', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/brands`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.some((b: { id: string }) => b.id === brandId)).toBe(
      true,
    );
  });

  it('FINANCE GET /brands → 403 (brand.read yok)', () =>
    request(app.getHttpServer())
      .get(`${base}/brands`)
      .set(auth(financeToken))
      .expect(403));

  it('DELETE /brands/:id → 200', () =>
    request(app.getHttpServer())
      .delete(`${base}/brands/${brandId}`)
      .set(auth(adminToken))
      .expect(200)
      .then(() => {
        brandId = '';
      }));
});
