// backend/test/whatsapp.e2e-spec.ts
// E2E — WhatsApp: bağlı değilken 400, RBAC, gönderim (stub Graph), Meta verify challenge,
// gelen webhook (imzasız → 401 yazım yok; imzalı → IN mesaj + lead eşleme),
// otomasyon lead.created → send_whatsapp zinciri.
process.env.THROTTLE_LIMIT = '1000';
process.env.APP_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  GraphResponse,
  WA_GRAPH_CLIENT,
} from '../src/modules/whatsapp/graph-client';

const base = '/api/v1';
const APP_SECRET = 'test-wa-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

// Graph API stub'ı: ağa çıkmaz; çağrıları kaydeder.
const graphCalls: { url: string; body: unknown }[] = [];
const graphStub = {
  post: (url: string, body: unknown): Promise<GraphResponse> => {
    graphCalls.push({ url, body });
    return Promise.resolve({
      status: 200,
      body: JSON.stringify({ messages: [{ id: 'wamid.STUB' }] }),
    });
  },
};

describe('WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let connId: string;
  let leadId: string;
  let ruleId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const leadPhone = `+9055511${String(ts).slice(-5)}`;
  const financeEmail = `wa_fin_${ts}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (e: string, p: string) =>
    request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email: e, password: p });
  const waitFor = async (
    cond: () => Promise<boolean>,
    timeoutMs = 3000,
  ): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await cond()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WA_GRAPH_CLIENT)
      .useValue(graphStub)
      .compile();
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
        email: financeEmail,
        password: pw,
        firstName: 'W',
        lastName: 'A',
        roleIds: [roleId.FINANCE],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    financeToken = (await login(financeEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.whatsAppMessage.deleteMany({
        where: { phone: { contains: String(ts).slice(-5) } },
      });
      if (ruleId)
        await prisma.automationRule.deleteMany({ where: { id: ruleId } });
      if (leadId) await prisma.lead.deleteMany({ where: { id: leadId } });
      await prisma.connection.deleteMany({ where: { provider: 'whatsapp' } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('bağlı değilken POST /whatsapp/send → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/whatsapp/send`)
      .set(auth(adminToken))
      .send({ to: '+905550000000', body: 'x' })
      .expect(400));

  it('FINANCE POST /whatsapp/send → 403 (whatsapp.send yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/whatsapp/send`)
      .set(auth(financeToken))
      .send({ to: '+905550000000', body: 'x' })
      .expect(403));

  it('bağla + lead oluştur + gönder → OUT mesaj lead ile eşleşir', async () => {
    const conn = await request(app.getHttpServer())
      .post(`${base}/connections`)
      .set(auth(adminToken))
      .send({
        provider: 'whatsapp',
        secrets: {
          accessToken: 'fake-token',
          appSecret: APP_SECRET,
          verifyToken: VERIFY_TOKEN,
        },
        config: { phoneNumberId: '111222333' },
      })
      .expect(201);
    connId = conn.body.data.id;

    const lead = await request(app.getHttpServer())
      .post(`${base}/leads`)
      .set(auth(adminToken))
      .send({ firstName: `WaLead_${ts}`, lastName: 'T', phone: leadPhone })
      .expect(201);
    leadId = lead.body.data.id;

    const r = await request(app.getHttpServer())
      .post(`${base}/whatsapp/send`)
      .set(auth(adminToken))
      .send({ to: leadPhone, body: 'Merhaba!' })
      .expect(200);
    expect(r.body.data.ok).toBe(true);
    expect(r.body.data.message.direction).toBe('OUT');
    expect(r.body.data.message.leadId).toBe(leadId); // telefonla eşleşme
    expect(r.body.data.message.waId).toBe('wamid.STUB');
    // Graph stub'ına doğru phoneNumberId ile gidildi
    expect(graphCalls.some((c) => c.url.includes('111222333'))).toBe(true);
  });

  it('GET /webhooks/whatsapp verify: yanlış token → 401, doğru → ham challenge', async () => {
    await request(app.getHttpServer())
      .get(
        `${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=123`,
      )
      .expect(401);
    const ok = await request(app.getHttpServer())
      .get(
        `${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=42abc`,
      )
      .expect(200);
    expect(ok.text).toBe('42abc'); // zarf yok, HAM metin
  });

  it('POST /webhooks/whatsapp imzasız → 401, mesaj yazılmaz', async () => {
    const before = await prisma.whatsAppMessage.count({
      where: { direction: 'IN' },
    });
    await request(app.getHttpServer())
      .post(`${base}/webhooks/whatsapp`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ entry: [] }))
      .expect(401);
    const after = await prisma.whatsAppMessage.count({
      where: { direction: 'IN' },
    });
    expect(after).toBe(before);
  });

  it('POST /webhooks/whatsapp geçerli imza → IN mesaj + lead eşleme', async () => {
    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: leadPhone.replace('+', ''),
                    id: 'wamid.IN1',
                    type: 'text',
                    text: { body: 'Selam, bilgi almak istiyorum' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig =
      'sha256=' +
      createHmac('sha256', APP_SECRET).update(payload).digest('hex');
    const r = await request(app.getHttpServer())
      .post(`${base}/webhooks/whatsapp`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(payload)
      .expect(200);
    expect(r.body.data.stored).toBe(1);

    const msg = await prisma.whatsAppMessage.findFirst({
      where: { waId: 'wamid.IN1' },
    });
    expect(msg?.direction).toBe('IN');
    expect(msg?.leadId).toBe(leadId);
  });

  it('GET /whatsapp/conversations + thread → sohbet görünür', async () => {
    const conv = await request(app.getHttpServer())
      .get(`${base}/whatsapp/conversations`)
      .set(auth(adminToken))
      .expect(200);
    const phoneDigits = leadPhone.replace(/[^\d]/g, '');
    const c = conv.body.data.find(
      (x: { phone: string }) => x.phone === phoneDigits,
    );
    expect(c).toBeDefined();
    expect(c.count).toBeGreaterThanOrEqual(2); // OUT + IN

    const thread = await request(app.getHttpServer())
      .get(`${base}/whatsapp/thread/${phoneDigits}`)
      .set(auth(adminToken))
      .expect(200);
    expect(thread.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('otomasyon: lead.created → send_whatsapp (karşılama) zinciri çalışır', async () => {
    const rule = await request(app.getHttpServer())
      .post(`${base}/automation/rules`)
      .set(auth(adminToken))
      .send({
        name: `WaWelcome_${ts}`,
        trigger: 'lead.created',
        actions: [{ type: 'send_whatsapp', note: 'Hoş geldin {{firstName}}!' }],
      })
      .expect(201);
    ruleId = rule.body.data.id;

    const phone2 = `+9055522${String(ts).slice(-5)}`;
    const lead2 = await request(app.getHttpServer())
      .post(`${base}/leads`)
      .set(auth(adminToken))
      .send({ firstName: `WaAuto_${ts}`, lastName: 'T', phone: phone2 })
      .expect(201);

    // Olay async — OUT mesaj kaydını bekle.
    const found = await waitFor(async () => {
      const m = await prisma.whatsAppMessage.findFirst({
        where: { phone: phone2.replace(/[^\d]/g, ''), direction: 'OUT' },
      });
      return !!m && m.body === `Hoş geldin WaAuto_${ts}!`;
    });
    expect(found).toBe(true);

    await prisma.lead.deleteMany({ where: { id: lead2.body.data.id } });
  });

  it('bağlantı silinince send tekrar 400', async () => {
    await request(app.getHttpServer())
      .delete(`${base}/connections/${connId}`)
      .set(auth(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .post(`${base}/whatsapp/send`)
      .set(auth(adminToken))
      .send({ to: leadPhone, body: 'x' })
      .expect(400);
  });
});
