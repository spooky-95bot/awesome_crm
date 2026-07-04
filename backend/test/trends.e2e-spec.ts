// backend/test/trends.e2e-spec.ts
// E2E — v4.3 trend sinyalleri: bağlı değil 400, RBAC, SerpAPI (EXT_HTTP stub) → zaman serisi.
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

const extStub = {
  request: (_m: string, url: string): Promise<ExtHttpResponse> => {
    if (url.includes('google_trends')) {
      return Promise.resolve({
        status: 200,
        body: JSON.stringify({
          interest_over_time: {
            timeline_data: [
              {
                date: 'Jun 1',
                values: [
                  { query: 'streetwear', extracted_value: 60 },
                  { query: 'oversize', extracted_value: 40 },
                ],
              },
              {
                date: 'Jun 8',
                values: [
                  { query: 'streetwear', extracted_value: 75 },
                  { query: 'oversize', extracted_value: 55 },
                ],
              },
            ],
          },
        }),
      });
    }
    return Promise.resolve({ status: 404, body: '{}' });
  },
};

describe('Trends (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let brandId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const finEmail = `tr_fin_${ts}@crm.dev`;
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
        firstName: 'T',
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
      .send({ name: `TrBrand_${ts}`, keywords: ['streetwear', 'oversize'] })
      .expect(201);
    brandId = brand.body.data.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (brandId) await prisma.brand.deleteMany({ where: { id: brandId } });
      await prisma.connection.deleteMany({ where: { provider: 'serpapi' } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('serpapi bağlı değilken trend → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/trends`)
      .set(auth(adminToken))
      .send({ geo: 'TR' })
      .expect(400));

  it('FINANCE trend → 403 (brand.read yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/trends`)
      .set(auth(financeToken))
      .send({ geo: 'TR' })
      .expect(403));

  it('serpapi bağla + trend → zaman serisi (marka keyword)', async () => {
    await request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({ provider: 'serpapi', secrets: { apiKey: 'serp-key' } })
      .expect(201);

    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/trends`)
      .set(auth(adminToken))
      .send({ geo: 'tr' })
      .expect(200);
    expect(r.body.data.geo).toBe('TR');
    expect(r.body.data.keywords).toEqual(
      expect.arrayContaining(['streetwear', 'oversize']),
    );
    expect(r.body.data.timeline.length).toBe(2);
    expect(r.body.data.timeline[1].points.streetwear).toBe(75);
  });
});
