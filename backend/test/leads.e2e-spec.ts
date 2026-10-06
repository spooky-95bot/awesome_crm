// backend/test/leads.e2e-spec.ts
// v2.1c E2E — nitelenmemiş Lead + convert (Contact+Deal üretimi).
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

describe('Leads (unqualified) + convert (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let salesToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let leadId: string;
  let dealId: string;
  let contactId: string;
  let deal2Id: string;
  let contact2Id: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `lead2_sales_${ts}@crm.dev`;
  const financeEmail = `lead2_fin_${ts}@crm.dev`;
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

    const adminToken = (await login(adminEmail, adminPw).expect(200)).body.data
      .accessToken;
    const roles = await request(app.getHttpServer())
      .get(`${base}/roles`)
      .set(auth(adminToken))
      .expect(200);
    for (const r of roles.body.data) roleId[r.name] = r.id;

    const mk = async (email: string, role: string) => {
      const res = await request(app.getHttpServer())
        .post(`${base}/users`)
        .set(auth(adminToken))
        .send({
          email,
          password: pw,
          firstName: 'L',
          lastName: 'T',
          roleIds: [roleId[role]],
        })
        .expect(201);
      testUserIds.push(res.body.data.id);
    };
    await mk(salesEmail, 'SALES');
    await mk(financeEmail, 'FINANCE');
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
    financeToken = (await login(financeEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.deal.deleteMany({
        where: { id: { in: [dealId, deal2Id].filter(Boolean) } },
      });
      await prisma.contact.deleteMany({
        where: { id: { in: [contactId, contact2Id].filter(Boolean) } },
      });
      await prisma.company.deleteMany({
        where: { name: { in: [`LeadCo_${ts}`, `OverrideCo_${ts}`] } },
      });
      await prisma.lead.deleteMany({ where: { firstName: `LN_${ts}` } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('SALES POST /leads → 201 (status NEW)', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/leads`)
      .set(auth(salesToken))
      .send({
        firstName: `LN_${ts}`,
        lastName: 'Aday',
        email: 'aday@x.test',
        companyName: `LeadCo_${ts}`,
        source: 'WEB',
      })
      .expect(201);
    leadId = r.body.data.id;
    expect(r.body.data.status).toBe('NEW');
  });

  it('FINANCE POST /leads → 403 (lead.create yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/leads`)
      .set(auth(financeToken))
      .send({ firstName: `LN_${ts}`, lastName: 'X' })
      .expect(403));

  it('POST /leads/:id/convert → 200, Contact + Deal üretir', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/leads/${leadId}/convert`)
      .set(auth(salesToken))
      .expect(200);
    expect(r.body.data.contactId).toBeDefined();
    expect(r.body.data.dealId).toBeDefined();
    expect(r.body.data.lead.status).toBe('CONVERTED');
    contactId = r.body.data.contactId;
    dealId = r.body.data.dealId;

    // Üretilen Deal contact+company'ye bağlı
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.contactId).toBe(contactId);
    expect(deal?.companyId).toBeTruthy();
  });

  it('convert + override → Deal başlık/değer/şirket override edilir', async () => {
    const lead = await request(app.getHttpServer())
      .post(`${base}/leads`)
      .set(auth(salesToken))
      .send({ firstName: `LN_${ts}`, lastName: 'Override' })
      .expect(201);
    // Hedef stage (ilk pipeline'ın 2. stage'i)
    const pipes = await request(app.getHttpServer())
      .get(`${base}/pipelines`)
      .set(auth(salesToken))
      .expect(200);
    const stage = pipes.body.data[0].stages[1];
    const r = await request(app.getHttpServer())
      .post(`${base}/leads/${lead.body.data.id}/convert`)
      .set(auth(salesToken))
      .send({
        title: `Big Deal ${ts}`,
        value: '15000.50',
        currency: 'USD',
        company: `OverrideCo_${ts}`,
        stageId: stage.id,
      })
      .expect(200);
    deal2Id = r.body.data.dealId;
    contact2Id = r.body.data.contactId;
    const deal = await prisma.deal.findUnique({ where: { id: deal2Id } });
    expect(deal?.title).toBe(`Big Deal ${ts}`);
    expect(deal?.value?.toString()).toBe('15000.5');
    expect(deal?.currency).toBe('USD');
    expect(deal?.stageId).toBe(stage.id);
    expect(deal?.company).toBe(`OverrideCo_${ts}`);
  });

  it('Aynı lead tekrar convert → 409', () =>
    request(app.getHttpServer())
      .post(`${base}/leads/${leadId}/convert`)
      .set(auth(salesToken))
      .expect(409));

  it('Dönüştürülmüş lead PATCH → 409', () =>
    request(app.getHttpServer())
      .patch(`${base}/leads/${leadId}`)
      .set(auth(salesToken))
      .send({ firstName: 'Yeni' })
      .expect(409));

  it('GET /leads?status=CONVERTED → dönüşeni içerir', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/leads?status=CONVERTED`)
      .set(auth(salesToken))
      .expect(200);
    expect(r.body.data.map((l: { id: string }) => l.id)).toContain(leadId);
  });
});
