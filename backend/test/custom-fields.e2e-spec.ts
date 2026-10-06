// backend/test/custom-fields.e2e-spec.ts — v2.5 özel alanlar + Deal'de doğrulama.
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

describe('Custom fields (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let pipelineId: string;
  let stageId: string;
  const fieldKey = `segment_${Date.now()}`.replace(/[^a-z0-9_]/g, '');
  let defId: string;

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

    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { orderBy: { position: 'asc' }, take: 1 } },
    });
    pipelineId = pipeline.id;
    stageId = pipeline.stages[0].id;
  });

  afterAll(async () => {
    if (prisma) {
      if (defId)
        await prisma.customFieldDef.deleteMany({ where: { id: defId } });
      await prisma.deal.deleteMany({ where: { title: 'CF Deal' } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('ADMIN POST /custom-fields (SELECT, zorunlu) → 201', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/custom-fields`)
      .set(auth(adminToken))
      .send({
        entity: 'DEAL',
        key: fieldKey,
        label: 'Segment',
        type: 'SELECT',
        options: ['SMB', 'ENTERPRISE'],
        required: true,
      })
      .expect(201);
    defId = r.body.data.id;
  });

  it('Deal create: geçerli özel alan → 201 ve saklanır', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(adminToken))
      .send({
        pipelineId,
        stageId,
        title: 'CF Deal',
        customFields: { [fieldKey]: 'ENTERPRISE' },
      })
      .expect(201);
    expect(r.body.data.customFields[fieldKey]).toBe('ENTERPRISE');
  });

  it('Deal create: geçersiz SELECT değeri → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(adminToken))
      .send({
        pipelineId,
        stageId,
        title: 'CF Deal',
        customFields: { [fieldKey]: 'YANLIS' },
      })
      .expect(400));

  it('Deal create: zorunlu özel alan eksik → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(adminToken))
      .send({ pipelineId, stageId, title: 'CF Deal' })
      .expect(400));

  it('Deal create: tanımsız özel alan → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(adminToken))
      .send({
        pipelineId,
        stageId,
        title: 'CF Deal',
        customFields: { [fieldKey]: 'SMB', tanimsiz: 'x' },
      })
      .expect(400));
});
