// backend/test/rbac.e2e-spec.ts
// Faz 2 E2E — RBAC guard zinciri + kullanıcı/rol yönetimi (gerçek PostgreSQL).
// GEREKSİNİM: çalışan test DB + seed (5 rol + admin). Çalıştırma: npm run test:e2e
//
// Throttle, RBAC akışını engellememesi için bu test süitinde gevşetilir.
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

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let salesToken: string;
  let viewerToken: string;
  let adminUserId: string;
  let salesUserId: string;
  let viewerUserId: string;
  const roleId: Record<string, string> = {};

  const pw = 'S3cure!Passw0rd';
  const salesEmail = `sales_${Date.now()}@crm.dev`;
  const viewerEmail = `viewer_${Date.now()}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email, password });

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

    // Admin login
    const adminLogin = await login(adminEmail, adminPw).expect(200);
    adminToken = adminLogin.body.data.accessToken;
    adminUserId = adminLogin.body.data.user.id;

    // Rol id'leri
    const roles = await request(app.getHttpServer())
      .get(`${base}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    for (const r of roles.body.data) roleId[r.name] = r.id;

    // SALES ve VIEWER kullanıcılarını admin oluşturur
    const sales = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: salesEmail,
        password: pw,
        firstName: 'Sa',
        lastName: 'Les',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    salesUserId = sales.body.data.id;

    const viewer = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: viewerEmail,
        password: pw,
        firstName: 'Vi',
        lastName: 'Ewer',
        roleIds: [roleId.VIEWER],
      })
      .expect(201);
    viewerUserId = viewer.body.data.id;

    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
    viewerToken = (await login(viewerEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          OR: [
            { email: { in: [salesEmail, viewerEmail] } },
            { email: { startsWith: 'tmp_' } },
          ],
        },
      });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // E-2.2
  it('E-2.2 ADMIN POST /users → 201', () =>
    request(app.getHttpServer())
      .post(`${base}/users`)
      .set(auth(adminToken))
      .send({
        email: `tmp_${Date.now()}@crm.dev`,
        password: pw,
        firstName: 'T',
        lastName: 'M',
      })
      .expect(201)
      .expect((r) => expect(r.body.data.isActive).toBe(true)));

  // E-2.1
  it('E-2.1 SALES POST /users → 403', () =>
    request(app.getHttpServer())
      .post(`${base}/users`)
      .set(auth(salesToken))
      .send({
        email: `no_${Date.now()}@crm.dev`,
        password: pw,
        firstName: 'N',
        lastName: 'O',
      })
      .expect(403));

  // E-2.3
  it('E-2.3 VIEWER GET /users → 200 (salt okuma)', () =>
    request(app.getHttpServer())
      .get(`${base}/users`)
      .set(auth(viewerToken))
      .expect(200)
      .expect((r) => expect(r.body.meta.total).toBeGreaterThan(0)));

  // E-2.4
  it('E-2.4 VIEWER PATCH /users/:id → 403', () =>
    request(app.getHttpServer())
      .patch(`${base}/users/${salesUserId}`)
      .set(auth(viewerToken))
      .send({ firstName: 'Hack' })
      .expect(403));

  // E-2.8
  it('E-2.8 geçersiz UUID :id → 400 (ParseUUIDPipe)', () =>
    request(app.getHttpServer())
      .get(`${base}/users/not-a-uuid`)
      .set(auth(adminToken))
      .expect(400));

  // E-2.5 — privilege escalation: SALES kendine ADMIN ekleyemez (role.assign yok)
  it('E-2.5 SALES PATCH /users/:self/roles ADMIN ekler → 403', () =>
    request(app.getHttpServer())
      .patch(`${base}/users/${salesUserId}/roles`)
      .set(auth(salesToken))
      .send({ roleIds: [roleId.ADMIN] })
      .expect(403));

  // S-2.1 — sahte/kurcalanmış JWT imzası → 401
  it('S-2.1 kurcalanmış JWT imzası → 401', () => {
    const parts = adminToken.split('.');
    const forged = `${parts[0]}.${parts[1]}.AAAAINVALIDSIGAAAA`;
    return request(app.getHttpServer())
      .get(`${base}/users`)
      .set(auth(forged))
      .expect(401);
  });

  // E-2.7 — son admin silinemez
  it('E-2.7 son admin DELETE → 409', () =>
    request(app.getHttpServer())
      .delete(`${base}/users/${adminUserId}`)
      .set(auth(adminToken))
      .expect(409));

  // E-2.6 — CANLI yetki iptali: aynı token, yetki DB'den çekilince 403
  it('E-2.6 yetki değişimi anında yansır (aynı token → 403)', async () => {
    // Önce VIEWER okuyabiliyor
    await request(app.getHttpServer())
      .get(`${base}/users`)
      .set(auth(viewerToken))
      .expect(200);

    // Admin VIEWER'ın tüm rollerini kaldırır
    await request(app.getHttpServer())
      .patch(`${base}/users/${viewerUserId}/roles`)
      .set(auth(adminToken))
      .send({ roleIds: [] })
      .expect(200);

    // AYNI viewer token'ı ile tekrar → artık user.read yok → 403
    await request(app.getHttpServer())
      .get(`${base}/users`)
      .set(auth(viewerToken))
      .expect(403);
  });

  // ADMIN rolü korunur (lockout engeli)
  it('ADMIN rolü silinemez → 409', () =>
    request(app.getHttpServer())
      .delete(`${base}/roles/${roleId.ADMIN}`)
      .set(auth(adminToken))
      .expect(409));
});
