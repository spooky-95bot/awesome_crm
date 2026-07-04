// backend/test/market-prices.e2e-spec.ts
// E2E — v4.4 rakip fiyat: CSV içe aktar (ürün+fiyat noktası), re-import (güncelle+geçmiş), RBAC, sil.
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

describe('Market prices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let brandId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const finEmail = `mp_fin_${ts}@crm.dev`;
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
        firstName: 'M',
        lastName: 'P',
        roleIds: [roleId.FINANCE],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    financeToken = (await login(finEmail, pw).expect(200)).body.data
      .accessToken;

    const brand = await request(app.getHttpServer())
      .post(`${base}/brands`)
      .set(auth(adminToken))
      .send({ name: `MpBrand_${ts}` })
      .expect(201);
    brandId = brand.body.data.id;
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

  it('FINANCE import → 403', () =>
    request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/products/import-csv`)
      .set(auth(financeToken))
      .send({ csv: 'name,price\nX,10' })
      .expect(403));

  it('CSV içe aktar → 2 ürün + 2 fiyat noktası', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/products/import-csv`)
      .set(auth(adminToken))
      .send({
        csv:
          'name,price,currency,url\n' +
          'Oversize Tişört,299.90,TRY,https://rakip.com/tisort\n' +
          'Kapüşonlu,599,TRY,',
      })
      .expect(200);
    expect(r.body.data.created).toBe(2);
    expect(r.body.data.pricePoints).toBe(2);
  });

  it('re-import (fiyat değişti) → güncelle + yeni fiyat noktası', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/products/import-csv`)
      .set(auth(adminToken))
      .send({ csv: 'name,price,currency\nOversize Tişört,249.90,TRY' })
      .expect(200);
    expect(r.body.data.updated).toBe(1);
    expect(r.body.data.created).toBe(0);

    const list = await request(app.getHttpServer())
      .get(`${base}/brands/${brandId}/products`)
      .set(auth(adminToken))
      .expect(200);
    const tshirt = list.body.data.find(
      (p: { name: string }) => p.name === 'Oversize Tişört',
    );
    expect(Number(tshirt.price)).toBe(249.9);
    expect(tshirt.prices.length).toBe(2); // fiyat geçmişi 2 nokta
  });

  it('DELETE product → 200', async () => {
    const list = await request(app.getHttpServer())
      .get(`${base}/brands/${brandId}/products`)
      .set(auth(adminToken))
      .expect(200);
    const id = list.body.data[0].id;
    await request(app.getHttpServer())
      .delete(`${base}/products/${id}`)
      .set(auth(adminToken))
      .expect(200);
  });
});
