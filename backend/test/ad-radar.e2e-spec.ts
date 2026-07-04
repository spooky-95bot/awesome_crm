// backend/test/ad-radar.e2e-spec.ts
// E2E — v4.2 Meta Ad radarı: bağlı değil 400, nişe göre arama (EXT_HTTP stub), kaydet/listele/sil, RBAC.
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

// Ad Library yanıtı stub'ı (ağa çıkmaz).
const extStub = {
  request: (_m: string, url: string): Promise<ExtHttpResponse> => {
    if (url.includes('ads_archive')) {
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({
          data: [
            {
              id: 'AD-1',
              page_name: 'RakipStreet',
              ad_creative_bodies: ['Oversize tişört %50 indirim'],
              ad_snapshot_url: 'https://facebook.com/ads/archive/AD-1',
              ad_delivery_start_time: '2026-06-01',
              publisher_platforms: ['facebook', 'instagram'],
            },
          ],
        }),
      });
    }
    return Promise.resolve({ status: 404, body: '{}' });
  },
};

describe('Ad Radar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let brandId: string;
  let savedId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const finEmail = `ad_fin_${ts}@crm.dev`;
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
        firstName: 'A',
        lastName: 'D',
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
        name: `AdBrand_${ts}`,
        niche: 'Erkek sokak giyimi',
        keywords: ['streetwear', 'oversize'],
      })
      .expect(201);
    brandId = brand.body.data.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.savedAd.deleteMany({ where: { brandId } });
      if (brandId) await prisma.brand.deleteMany({ where: { id: brandId } });
      await prisma.connection.deleteMany({ where: { provider: 'meta_ads' } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('meta_ads bağlı değilken arama → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/ad-radar/search`)
      .set(auth(adminToken))
      .send({ country: 'TR' })
      .expect(400));

  it('FINANCE arama → 403 (brand.read yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/ad-radar/search`)
      .set(auth(financeToken))
      .send({ country: 'TR' })
      .expect(403));

  it('meta_ads bağla + niş arama → normalize reklam listesi', async () => {
    await request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({ provider: 'meta_ads', secrets: { accessToken: 'meta-tok' } })
      .expect(201);

    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/ad-radar/search`)
      .set(auth(adminToken))
      .send({ country: 'tr' }) // küçük harf → normalize
      .expect(200);
    expect(r.body.data.country).toBe('TR');
    // terim verilmedi → markanın keyword'leri kullanıldı
    expect(r.body.data.terms).toEqual(expect.arrayContaining(['streetwear']));
    expect(r.body.data.ads.length).toBe(1);
    expect(r.body.data.ads[0].pageName).toBe('RakipStreet');
    expect(r.body.data.ads[0].adArchiveId).toBe('AD-1');
  });

  it('reklam kaydet (idempotent) + listele', async () => {
    const save = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/ad-radar/save`)
      .set(auth(adminToken))
      .send({
        adArchiveId: 'AD-1',
        pageName: 'RakipStreet',
        body: 'Oversize tişört',
        snapshotUrl: 'https://facebook.com/ads/archive/AD-1',
      })
      .expect(201);
    savedId = save.body.data.id;
    // ikinci kez → aynı kayıt (upsert), çift olmaz
    await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/ad-radar/save`)
      .set(auth(adminToken))
      .send({ adArchiveId: 'AD-1' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`${base}/brands/${brandId}/ad-radar/saved`)
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.data.length).toBe(1);
  });

  it('kayıtlı reklamı sil → 200', () =>
    request(app.getHttpServer())
      .delete(`${base}/ad-radar/saved/${savedId}`)
      .set(auth(adminToken))
      .expect(200));
});
