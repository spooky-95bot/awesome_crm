// backend/test/integrations.e2e-spec.ts
// Faz 5 E2E — Webhook abonelik (secret bir kez), RBAC, HTTPS/SSRF, inbound imza+idempotency.
// GEREKSİNİM: çalışan test DB + seed. Çalıştırma: npm run test:e2e
process.env.THROTTLE_LIMIT = '1000';
process.env.INBOUND_WEBHOOK_SECRET = 'test-inbound-secret';

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
import { signPayload } from '../src/modules/integrations/util/webhook-signature.util';

const base = '/api/v1';

describe('Integrations / Webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let webhookId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `int_sales_${ts}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email, password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
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
        firstName: 'I',
        lastName: 'S',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.webhookSubscription.deleteMany({
        where: { url: { contains: `wh_${ts}` } },
      });
      await prisma.processedWebhook.deleteMany({
        where: { source: `src_${ts}` },
      });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  // E-5.1 — secret bir kez döner
  it('E-5.1 ADMIN POST /webhooks → 201, secret bir kez döner', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/integrations/webhooks`)
      .set(auth(adminToken))
      .send({
        url: `https://example.com/wh_${ts}`,
        events: ['invoice.paid', 'deal.created'],
      })
      .expect(201);
    webhookId = r.body.data.id;
    expect(typeof r.body.data.secret).toBe('string');
    expect(r.body.data.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('liste secret içermez', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/integrations/webhooks`)
      .set(auth(adminToken))
      .expect(200);
    const wh = r.body.data.find((w: { id: string }) => w.id === webhookId);
    expect(wh).toBeDefined();
    expect(wh.secret).toBeUndefined();
  });

  // E-5.2 — SALES yetkisiz
  it('E-5.2 SALES POST /webhooks → 403', () =>
    request(app.getHttpServer())
      .post(`${base}/integrations/webhooks`)
      .set(auth(salesToken))
      .send({ url: `https://example.com/wh_${ts}_x`, events: ['deal.created'] })
      .expect(403));

  // E-5.3 — http reddedilir (yalnız HTTPS)
  it('E-5.3 http:// URL → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/integrations/webhooks`)
      .set(auth(adminToken))
      .send({
        url: `http://example.com/wh_${ts}_insecure`,
        events: ['deal.created'],
      })
      .expect(400));

  // S-5.1 — SSRF: iç IP reddedilir
  it('S-5.1 iç IP webhook URL → 400 (SSRF)', () =>
    request(app.getHttpServer())
      .post(`${base}/integrations/webhooks`)
      .set(auth(adminToken))
      .send({
        url: 'https://169.254.169.254/latest',
        events: ['deal.created'],
      })
      .expect(400));

  // --- Gelen webhook ---
  const source = `src_${ts}`;
  const inboundBody = JSON.stringify({ hello: 'world', n: 1 });

  // E-5.6 — imzasız inbound → 401
  it('E-5.6 inbound imzasız → 401', () =>
    request(app.getHttpServer())
      .post(`${base}/integrations/webhooks/inbound/${source}`)
      .type('application/json')
      .send(inboundBody)
      .expect(401));

  it('inbound yanlış imza → 401', () => {
    const tstamp = Math.floor(Date.now() / 1000);
    return request(app.getHttpServer())
      .post(`${base}/integrations/webhooks/inbound/${source}`)
      .type('application/json')
      .set('x-crm-timestamp', String(tstamp))
      .set('x-crm-signature', 'sha256=bad')
      .send(inboundBody)
      .expect(401);
  });

  // E-5.7 — geçerli imza → 200; aynı delivery tekrar → duplicate
  it('E-5.7 inbound geçerli imza → 200; tekrar → duplicate (idempotent)', async () => {
    const tstamp = Math.floor(Date.now() / 1000);
    const sig = signPayload('test-inbound-secret', tstamp, inboundBody);
    const send = () =>
      request(app.getHttpServer())
        .post(`${base}/integrations/webhooks/inbound/${source}`)
        .type('application/json')
        .set('x-crm-timestamp', String(tstamp))
        .set('x-crm-signature', sig)
        .set('x-crm-delivery', `dlv_${ts}`)
        .send(inboundBody);

    const first = await send().expect(200);
    expect(first.body.data.duplicate).toBe(false);

    const second = await send().expect(200);
    expect(second.body.data.duplicate).toBe(true);
  });

  // Silme
  it('ADMIN DELETE /webhooks/:id → 200', () =>
    request(app.getHttpServer())
      .delete(`${base}/integrations/webhooks/${webhookId}`)
      .set(auth(adminToken))
      .expect(200));
});
