// backend/test/deals.e2e-spec.ts
// Faz 3 E2E — Deal/Kanban: board, move (rank sırası), cross-pipeline, sahiplik/IDOR.
// GEREKSİNİM: çalışan test DB + seed (varsayılan pipeline). Çalıştırma: npm run test:e2e
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

describe('Deals / Kanban (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let salesToken: string;
  let sales2Token: string;
  let viewerToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];

  let pipelineId: string;
  let stageNew: string;
  let stageContact: string;
  let stageWon: string;
  let p2Id: string;
  let p2Stage: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `deal_sales_${ts}@crm.dev`;
  const sales2Email = `deal_sales2_${ts}@crm.dev`;
  const viewerEmail = `deal_viewer_${ts}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post(`${base}/auth/login`)
      .send({ email, password });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const createUser = async (email: string, roleName: string) => {
    const res = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set(auth(adminToken))
      .send({
        email,
        password: pw,
        firstName: 'L',
        lastName: 'T',
        roleIds: [roleId[roleName]],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    return res.body.data.id;
  };

  const createDeal = (token: string, stageId: string, title: string) =>
    request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(token))
      .send({ pipelineId, stageId, title })
      .expect(201);

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

    await createUser(salesEmail, 'SALES');
    await createUser(sales2Email, 'SALES');
    await createUser(viewerEmail, 'VIEWER');
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
    sales2Token = (await login(sales2Email, pw).expect(200)).body.data
      .accessToken;
    viewerToken = (await login(viewerEmail, pw).expect(200)).body.data
      .accessToken;

    // Varsayılan pipeline + stage'ler
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    pipelineId = pipeline.id;
    stageNew = pipeline.stages[0].id;
    stageContact = pipeline.stages[1].id;
    stageWon = pipeline.stages.find((s) => s.isWon)!.id;

    // İkinci pipeline (cross-pipeline testi için)
    const p2 = await prisma.pipeline.create({
      data: {
        name: `P2_${ts}`,
        stages: { create: [{ name: 'P2New', position: 0 }] },
      },
      include: { stages: true },
    });
    p2Id = p2.id;
    p2Stage = p2.stages[0].id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.deal.deleteMany({
        where: { OR: [{ ownerId: { in: testUserIds } }, { pipelineId: p2Id }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.pipeline.deleteMany({ where: { id: p2Id } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  let l1: string;
  let l2: string;
  let l3: string;

  // E-3.1
  it('E-3.1 SALES POST /deals → 201 (sahip = oluşturan)', async () => {
    const r = await createDeal(salesToken, stageNew, 'Deal 1');
    l1 = r.body.data.id;
    expect(r.body.data.status).toBe('OPEN');
    expect(r.body.data.value).toBeNull();

    l2 = (await createDeal(salesToken, stageNew, 'Deal 2')).body.data.id;
    l3 = (await createDeal(salesToken, stageContact, 'Deal 3')).body.data.id;
  });

  // E-3.2
  it('E-3.2 GET /deals/board → stage + sıralı deal yapısı', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/deals/board?pipelineId=${pipelineId}`)
      .set(auth(salesToken))
      .expect(200);
    const stages = r.body.data.stages;
    expect(Array.isArray(stages)).toBe(true);
    const colNew = stages.find((s: { id: string }) => s.id === stageNew);
    expect(colNew.deals.length).toBeGreaterThanOrEqual(2);
  });

  // E-3.3
  it('E-3.3 PATCH /deals/:id/move araya bırak → doğru yeni sıra', async () => {
    // L3'ü stageNew'de L1 ile L2 arasına taşı
    await request(app.getHttpServer())
      .patch(`${base}/deals/${l3}/move`)
      .set(auth(salesToken))
      .send({ toStageId: stageNew, beforeDealId: l1, afterDealId: l2 })
      .expect(200);

    const r = await request(app.getHttpServer())
      .get(`${base}/deals/board?pipelineId=${pipelineId}`)
      .set(auth(salesToken))
      .expect(200);
    const colNew = r.body.data.stages.find(
      (s: { id: string }) => s.id === stageNew,
    );
    const order = colNew.deals.map((l: { id: string }) => l.id);
    expect(order.indexOf(l1)).toBeLessThan(order.indexOf(l3));
    expect(order.indexOf(l3)).toBeLessThan(order.indexOf(l2));
  });

  // E-3.4
  it('E-3.4 VIEWER move → 403 (deal.move yok)', () =>
    request(app.getHttpServer())
      .patch(`${base}/deals/${l1}/move`)
      .set(auth(viewerToken))
      .send({ toStageId: stageContact })
      .expect(403));

  // E-3.5
  it('E-3.5 cross-pipeline move → 400', () =>
    request(app.getHttpServer())
      .patch(`${base}/deals/${l1}/move`)
      .set(auth(salesToken))
      .send({ toStageId: p2Stage })
      .expect(400));

  // isWon stage → status WON
  it("isWon stage'e taşıma → status WON", async () => {
    const r = await request(app.getHttpServer())
      .patch(`${base}/deals/${l2}/move`)
      .set(auth(salesToken))
      .send({ toStageId: stageWon })
      .expect(200);
    expect(r.body.data.status).toBe('WON');
  });

  // S-3.1 — IDOR: başka SALES'in deal'ine yazma → 403
  it("S-3.1 başka kullanıcının deal'ini güncelleme → 403 (sahiplik)", () =>
    request(app.getHttpServer())
      .patch(`${base}/deals/${l1}`)
      .set(auth(sales2Token))
      .send({ title: 'Çalındı' })
      .expect(403));

  // E-3.7 — sayfalama + arama
  it('E-3.7 sayfalama + arama → doğru meta', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/deals?pipelineId=${pipelineId}&q=Deal&page=1&limit=1`)
      .set(auth(salesToken))
      .expect(200);
    expect(r.body.meta.limit).toBe(1);
    expect(r.body.data.length).toBe(1);
    expect(r.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  // E-3.6 — soft delete sonrası board'da görünmez (silme: ADMIN; SALES'te deal.delete yok)
  it("E-3.6 DELETE /deals/:id → board'da görünmez", async () => {
    // SALES deal.delete iznine sahip değil → 403 (RBAC doğrulaması)
    await request(app.getHttpServer())
      .delete(`${base}/deals/${l1}`)
      .set(auth(salesToken))
      .expect(403);

    // ADMIN siler (deal.delete + tüm deal'lere yetki)
    await request(app.getHttpServer())
      .delete(`${base}/deals/${l1}`)
      .set(auth(adminToken))
      .expect(200);

    const r = await request(app.getHttpServer())
      .get(`${base}/deals/board?pipelineId=${pipelineId}`)
      .set(auth(salesToken))
      .expect(200);
    const ids = r.body.data.stages.flatMap((s: { deals: { id: string }[] }) =>
      s.deals.map((l) => l.id),
    );
    expect(ids).not.toContain(l1);
  });
});
