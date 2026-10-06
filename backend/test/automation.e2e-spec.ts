// backend/test/automation.e2e-spec.ts — v2.3 otomasyon: kural CRUD + canlı motor.
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
import { AutomationEngine } from '../src/modules/automation/automation.engine';

const base = '/api/v1';

describe('Automation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let engine: AutomationEngine;
  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let ruleId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `auto_sales_${ts}@crm.dev`;
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
    engine = app.get(AutomationEngine);

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
        firstName: 'A',
        lastName: 'U',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      if (ruleId)
        await prisma.automationRule.deleteMany({ where: { id: ruleId } });
      await prisma.automationRule.deleteMany({ where: { name: `Rule_${ts}` } });
      await prisma.deal.deleteMany({ where: { title: `AutoDeal_${ts}` } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('ADMIN POST /automation/rules → 201', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/automation/rules`)
      .set(auth(adminToken))
      .send({
        name: `Rule_${ts}`,
        trigger: 'deal.created',
        actions: [{ type: 'create_activity', note: 'Otomatik karşılama notu' }],
      })
      .expect(201);
    ruleId = r.body.data.id;
    expect(r.body.data.isActive).toBe(true);
  });

  it('SALES POST /automation/rules → 403 (automation.manage yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/automation/rules`)
      .set(auth(salesToken))
      .send({
        name: `Rule_${ts}`,
        trigger: 'deal.created',
        actions: [{ type: 'log' }],
      })
      .expect(403));

  it('Motor: deal.created kuralı tetiklenince DealActivity üretir', async () => {
    // Bir deal oluştur (varsayılan pipeline ilk stage)
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { orderBy: { position: 'asc' }, take: 1 } },
    });
    const deal = await prisma.deal.create({
      data: {
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        title: `AutoDeal_${ts}`,
        rank: 1,
      },
    });

    // Motoru deterministik çağır (event yerine doğrudan)
    await engine.run('deal.created', { dealId: deal.id, title: deal.title });

    const activities = await prisma.dealActivity.findMany({
      where: { dealId: deal.id, type: 'AUTOMATION' },
    });
    expect(activities.length).toBeGreaterThanOrEqual(1);
    expect((activities[0].payload as { note?: string }).note).toContain(
      'karşılama',
    );
  });

  it('Kural pasifleştirilince tetiklenmez', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/automation/rules/${ruleId}`)
      .set(auth(adminToken))
      .send({ isActive: false })
      .expect(200);

    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { orderBy: { position: 'asc' }, take: 1 } },
    });
    const deal = await prisma.deal.create({
      data: {
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        title: `AutoDeal_${ts}`,
        rank: 2,
      },
    });
    await engine.run('deal.created', { dealId: deal.id });
    const activities = await prisma.dealActivity.findMany({
      where: { dealId: deal.id, type: 'AUTOMATION' },
    });
    expect(activities.length).toBe(0);
  });
});
