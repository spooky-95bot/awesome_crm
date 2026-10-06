// backend/test/connections.e2e-spec.ts
// E2E — Entegrasyon bağlantıları: katalog, RBAC, bağla (sır şifreli & yanıtta yok),
// zorunlu-alan 400, kullanılamaz sağlayıcı 400, çift 409, test, sil.
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

const base = '/api/v1';

describe('Connections (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let connId: string;
  const TOKEN_SECRET = `EAA_secret_${Date.now()}`;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `conn_sales_${ts}@crm.dev`;
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
        firstName: 'C',
        lastName: 'N',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.connection.deleteMany({ where: { provider: 'whatsapp' } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('GET /connections/catalog → 200 (cryptoReady + whatsapp)', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/connections/catalog`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.cryptoReady).toBe(true);
    expect(r.body.data.providers.map((p: { key: string }) => p.key)).toContain(
      'whatsapp',
    );
  });

  it('SALES GET /connections → 403 (integration.read yok)', () =>
    request(app.getHttpServer())
      .get(`${base}/connections`)
      .set(auth(salesToken))
      .expect(403));

  it('ADMIN connect whatsapp → 201, sır YANITTA YOK', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({
        provider: 'whatsapp',
        label: 'Main',
        secrets: { accessToken: TOKEN_SECRET },
        config: { phoneNumberId: '123456' },
      })
      .expect(201);
    connId = r.body.data.id;
    expect(r.body.data.secretFields).toContain('accessToken');
    // Ham sır hiçbir alanda dönmemeli
    expect(JSON.stringify(r.body)).not.toContain(TOKEN_SECRET);

    // DB'de de düz saklanmamalı (şifreli)
    const row = await prisma.connection.findFirst({
      where: { id: connId },
    });
    expect(row?.secretsEnc).toBeTruthy();
    expect(row?.secretsEnc).not.toContain(TOKEN_SECRET);
    expect(row?.secretsEnc?.startsWith('v1:')).toBe(true);
  });

  it('connect zorunlu alan eksik → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({ provider: 'stripe', secrets: {} })
      .expect(400));

  it('connect kullanılamaz sağlayıcı (iyzico) → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({ provider: 'iyzico' })
      .expect(400));

  it('aynı sağlayıcı ikinci kez → 409', () =>
    request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({
        provider: 'whatsapp',
        secrets: { accessToken: 'x' },
        config: { phoneNumberId: '9' },
      })
      .expect(409));

  it('GET /connections → bağlantı görünür, sır yok', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/connections`)
      .set(auth(adminToken))
      .expect(200);
    const c = r.body.data.find((x: { id: string }) => x.id === connId);
    expect(c).toBeDefined();
    expect(JSON.stringify(r.body)).not.toContain(TOKEN_SECRET);
  });

  it('POST /connections/:id/test → ok alanı döner (geçersiz kimlikle false)', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/connections/${connId}/test`)
      .set(auth(adminToken))
      .expect(200);
    expect(typeof r.body.data.ok).toBe('boolean');
  });

  it('DELETE /connections/:id → 200', () =>
    request(app.getHttpServer())
      .delete(`${base}/connections/${connId}`)
      .set(auth(adminToken))
      .expect(200));
});
