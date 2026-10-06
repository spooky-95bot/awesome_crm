// backend/test/ai.e2e-spec.ts — v2.6 AI (Claude) uçları.
// Test ortamında ANTHROPIC_API_KEY yok → AI devre dışı: status enabled:false,
// üretim uçları 503 (graceful degradation). Yetki kapısı (ai.use) da doğrulanır.
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

describe('AI (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let dealId: string;

  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

    adminToken = (
      await request(app.getHttpServer())
        .post(`${base}/auth/login`)
        .send({ email: adminEmail, password: adminPw })
        .expect(200)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.deal.deleteMany({ where: { title: 'AI Deal' } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('GET /ai/status → 200, enabled:false (anahtar yok)', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/ai/status`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.enabled).toBe(false);
    expect(typeof r.body.data.model).toBe('string');
  });

  it('GET /ai/status (token yok) → 401', () =>
    request(app.getHttpServer()).get(`${base}/ai/status`).expect(401));

  it('POST /ai/summarize → 503 (anahtar yok, graceful)', () =>
    request(app.getHttpServer())
      .post(`${base}/ai/summarize`)
      .set(auth(adminToken))
      .send({ text: 'Müşteri ile uzun bir görüşme yapıldı.' })
      .expect(503));

  it('POST /ai/draft-email: geçersiz body → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/ai/draft-email`)
      .set(auth(adminToken))
      .send({ tone: 'gariptone' })
      .expect(400));

  it('POST /ai/deals/:id/score → 503 (geçerli deal, anahtar yok)', async () => {
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { orderBy: { position: 'asc' }, take: 1 } },
    });
    const r = await request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(adminToken))
      .send({
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        title: 'AI Deal',
      })
      .expect(201);
    dealId = r.body.data.id;

    await request(app.getHttpServer())
      .post(`${base}/ai/deals/${dealId}/score`)
      .set(auth(adminToken))
      .expect(503);
  });
});
