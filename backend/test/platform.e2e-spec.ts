// backend/test/platform.e2e-spec.ts — v2.9 denetim kaydı + arama + GDPR.
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
const tag = Date.now();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Platform — audit/search/gdpr (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

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
      await prisma.deal.deleteMany({ where: { title: `Plat_${tag}` } });
      await prisma.contact.deleteMany({ where: { lastName: `Plat_${tag}` } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('Denetim: deal oluşturma audit-logs içine yazılır', async () => {
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { take: 1, orderBy: { position: 'asc' } } },
    });
    const r = await request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(auth(adminToken))
      .send({
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        title: `Plat_${tag}`,
      })
      .expect(201);
    expect(r.body.data.id).toBeTruthy();

    await wait(300); // audit fire-and-forget yazımı tamamlansın

    const logs = await request(app.getHttpServer())
      .get(`${base}/audit-logs`)
      .query({ entity: 'deals', limit: 10 })
      .set(auth(adminToken))
      .expect(200);
    const found = (
      logs.body.data as { action: string; entityId: string }[]
    ).some((l) => l.action === 'POST');
    expect(found).toBe(true);
    expect(logs.body.meta.total).toBeGreaterThan(0);
  });

  it('Arama: deal başlığı bulunur', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/search`)
      .query({ q: `Plat_${tag}` })
      .set(auth(adminToken))
      .expect(200);
    const titles = (r.body.data.deals as { title: string }[]).map(
      (d) => d.title,
    );
    expect(titles).toContain(`Plat_${tag}`);
  });

  it('Arama: kısa terim → 400', () =>
    request(app.getHttpServer())
      .get(`${base}/search`)
      .query({ q: 'a' })
      .set(auth(adminToken))
      .expect(400));

  it('GDPR: kişi dışa aktar + sil (deal bağı kopar)', async () => {
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { take: 1, orderBy: { position: 'asc' } } },
    });
    const contact = await prisma.contact.create({
      data: { firstName: 'Gdpr', lastName: `Plat_${tag}` },
    });
    const linkedDeal = await prisma.deal.create({
      data: {
        title: `Plat_${tag}`,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        rank: 1,
        contactId: contact.id,
      },
    });

    const exp = await request(app.getHttpServer())
      .get(`${base}/gdpr/contacts/${contact.id}/export`)
      .set(auth(adminToken))
      .expect(200);
    expect(exp.body.data.contact.id).toBe(contact.id);
    expect(exp.body.data.deals.length).toBe(1);

    const er = await request(app.getHttpServer())
      .post(`${base}/gdpr/contacts/${contact.id}/erase`)
      .set(auth(adminToken))
      .expect(201);
    expect(er.body.data.erased).toBe(true);
    expect(er.body.data.unlinkedDeals).toBe(1);

    const gone = await prisma.contact.findUnique({
      where: { id: contact.id },
    });
    expect(gone).toBeNull();
    const deal = await prisma.deal.findUnique({
      where: { id: linkedDeal.id },
    });
    expect(deal?.contactId).toBeNull();
  });
});
