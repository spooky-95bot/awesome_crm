// backend/test/branding.e2e-spec.ts
// E2E — Marka: public okuma, RBAC (manage), data-URL doğrulama, sıfırlama.
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
const SVG_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');

describe('Branding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `brand_sales_${ts}@crm.dev`;
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
        email: salesEmail,
        password: pw,
        firstName: 'B',
        lastName: 'R',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      // Markayı varsayılana sıfırla (paylaşımlı tekil satır).
      await prisma.branding
        .update({
          where: { id: 'singleton' },
          data: { appName: null, logo: null },
        })
        .catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('PUBLIC GET /branding → 200 (oturum yok)', () =>
    request(app.getHttpServer())
      .get(`${base}/branding`)
      .expect(200)
      .expect((r) => {
        expect(r.body.data).toHaveProperty('appName');
        expect(r.body.data).toHaveProperty('logo');
      }));

  it('SALES PATCH /branding → 403 (branding.manage yok)', () =>
    request(app.getHttpServer())
      .patch(`${base}/branding`)
      .set(auth(salesToken))
      .send({ appName: 'X' })
      .expect(403));

  it('ADMIN PATCH appName + logo → 200, public GET yansıtır', async () => {
    const r = await request(app.getHttpServer())
      .patch(`${base}/branding`)
      .set(auth(adminToken))
      .send({ appName: `Brand_${ts}`, logo: SVG_DATA_URL })
      .expect(200);
    expect(r.body.data.appName).toBe(`Brand_${ts}`);
    expect(r.body.data.logo).toBe(SVG_DATA_URL);

    const pub = await request(app.getHttpServer())
      .get(`${base}/branding`)
      .expect(200);
    expect(pub.body.data.appName).toBe(`Brand_${ts}`);
  });

  it('ADMIN PATCH geçersiz logo (data URL değil) → 400', () =>
    request(app.getHttpServer())
      .patch(`${base}/branding`)
      .set(auth(adminToken))
      .send({ logo: 'http://evil.example/x.svg' })
      .expect(400));

  it('ADMIN PATCH boş → varsayılana sıfırlar (null)', async () => {
    const r = await request(app.getHttpServer())
      .patch(`${base}/branding`)
      .set(auth(adminToken))
      .send({ appName: '', logo: '' })
      .expect(200);
    expect(r.body.data.appName).toBeNull();
    expect(r.body.data.logo).toBeNull();
  });
});
