// backend/test/pipelines.e2e-spec.ts
// E2E — Pipeline stage yönetimi: ekle/yeniden adlandır/sırala/sil + negatif (deal'li→409, RBAC→403).
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

interface Stage {
  id: string;
  name: string;
  position: number;
}

describe('Pipelines / stages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let pipelineId: string;
  let origOrder: string[] = [];
  let tempStageId: string;
  let emptyStageId: string;
  let dealId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `pl_sales_${ts}@crm.dev`;
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
        firstName: 'P',
        lastName: 'L',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;

    const list = await request(app.getHttpServer())
      .get(`${base}/pipelines`)
      .set(auth(adminToken))
      .expect(200);
    pipelineId = list.body.data[0].id;
    origOrder = list.body.data[0].stages.map((s: Stage) => s.id);
  });

  afterAll(async () => {
    if (prisma) {
      // Deal (soft-deleted dahil) hard-delete → stage FK serbest.
      if (dealId) await prisma.deal.deleteMany({ where: { id: dealId } });
      if (emptyStageId)
        await prisma.stage.deleteMany({ where: { id: emptyStageId } });
      if (tempStageId)
        await prisma.stage.deleteMany({ where: { id: tempStageId } });
      // Orijinal sırayı geri yükle (paylaşımlı demo pipeline).
      for (let i = 0; i < origOrder.length; i++) {
        await prisma.stage.updateMany({
          where: { id: origOrder[i] },
          data: { position: 1000 + i },
        });
      }
      for (let i = 0; i < origOrder.length; i++) {
        await prisma.stage.updateMany({
          where: { id: origOrder[i] },
          data: { position: i },
        });
      }
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('SALES POST stage → 403 (pipeline.manage yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/pipelines/${pipelineId}/stages`)
      .set(auth(salesToken))
      .send({ name: 'x' })
      .expect(403));

  it('ADMIN stage ekle → 201 (sona)', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/pipelines/${pipelineId}/stages`)
      .set(auth(adminToken))
      .send({ name: `Temp_${ts}` })
      .expect(201);
    tempStageId = r.body.data.id;
    expect(r.body.data.position).toBe(origOrder.length);
  });

  it('ADMIN stage yeniden adlandır → 200', async () => {
    const r = await request(app.getHttpServer())
      .patch(`${base}/pipelines/${pipelineId}/stages/${tempStageId}`)
      .set(auth(adminToken))
      .send({ name: `Renamed_${ts}` })
      .expect(200);
    expect(r.body.data.name).toBe(`Renamed_${ts}`);
  });

  it('ADMIN reorder (temp en başa) → 200, pozisyonlar 0..n', async () => {
    const order = [tempStageId, ...origOrder];
    const r = await request(app.getHttpServer())
      .patch(`${base}/pipelines/${pipelineId}/stages/reorder`)
      .set(auth(adminToken))
      .send({ stageIds: order })
      .expect(200);
    const stages = r.body.data as Stage[];
    expect(stages.find((s) => s.id === tempStageId)?.position).toBe(0);
    expect(stages.map((s) => s.id)).toEqual(order);
  });

  it('reorder eksik küme → 400', () =>
    request(app.getHttpServer())
      .patch(`${base}/pipelines/${pipelineId}/stages/reorder`)
      .set(auth(adminToken))
      .send({ stageIds: [tempStageId] })
      .expect(400));

  it('İçinde deal olan stage silinemez → 409', async () => {
    const deal = await request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(adminToken))
      .send({ pipelineId, stageId: tempStageId, title: `PLDeal_${ts}` })
      .expect(201);
    dealId = deal.body.data.id;
    await request(app.getHttpServer())
      .delete(`${base}/pipelines/${pipelineId}/stages/${tempStageId}`)
      .set(auth(adminToken))
      .expect(409);
  });

  it('Boş stage silinebilir → 200', async () => {
    const add = await request(app.getHttpServer())
      .post(`${base}/pipelines/${pipelineId}/stages`)
      .set(auth(adminToken))
      .send({ name: `Empty_${ts}` })
      .expect(201);
    emptyStageId = add.body.data.id;
    await request(app.getHttpServer())
      .delete(`${base}/pipelines/${pipelineId}/stages/${emptyStageId}`)
      .set(auth(adminToken))
      .expect(200);
    emptyStageId = '';
  });
});
