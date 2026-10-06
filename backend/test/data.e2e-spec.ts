// backend/test/data.e2e-spec.ts — v2.8 CSV içe/dışa aktarma + dedup + birleştirme.
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
const email1 = `imp1_${tag}@crm.dev`;
const email2 = `imp2_${tag}@crm.dev`;

describe('Data — CSV/dedup/merge (e2e)', () => {
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
      await prisma.contact.deleteMany({
        where: { email: { in: [email1, email2] } },
      });
      await prisma.contact.deleteMany({
        where: { lastName: `Merge_${tag}` },
      });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('POST /data/import/contacts → 2 oluştur', async () => {
    const csv = `firstName,lastName,email\nAli,Veli,${email1}\nAyşe,Fatma,${email2}`;
    const r = await request(app.getHttpServer())
      .post(`${base}/data/import/contacts`)
      .set(auth(adminToken))
      .send({ csv })
      .expect(201);
    expect(r.body.data.created).toBe(2);
    expect(r.body.data.skipped).toBe(0);
  });

  it('POST /data/import/contacts (tekrar) → dedup ile atlanır', async () => {
    const csv = `firstName,lastName,email\nAli,Veli,${email1}\nAyşe,Fatma,${email2}`;
    const r = await request(app.getHttpServer())
      .post(`${base}/data/import/contacts`)
      .set(auth(adminToken))
      .send({ csv })
      .expect(201);
    expect(r.body.data.created).toBe(0);
    expect(r.body.data.skipped).toBe(2);
  });

  it('POST /data/import/contacts: eksik alan → hata satırı', async () => {
    const csv = `firstName,lastName,email\n,NoFirst,x_${tag}@crm.dev`;
    const r = await request(app.getHttpServer())
      .post(`${base}/data/import/contacts`)
      .set(auth(adminToken))
      .send({ csv })
      .expect(201);
    expect(r.body.data.created).toBe(0);
    expect(r.body.data.errors.length).toBe(1);
  });

  it('GET /data/export/contacts → text/csv ham gövde', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/data/export/contacts`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text.split('\r\n')[0]).toBe(
      'firstName,lastName,email,phone,title,company',
    );
    expect(r.text).toContain(email1);
  });

  it('GET /data/export/yanlis → 400', () =>
    request(app.getHttpServer())
      .get(`${base}/data/export/yanlis`)
      .set(auth(adminToken))
      .expect(400));

  it('POST /data/merge/contacts: deal taşınır, kaynak silinir', async () => {
    // İki kişi + kaynağa bağlı bir deal oluştur (prisma ile doğrudan).
    const target = await prisma.contact.create({
      data: { firstName: 'Hedef', lastName: `Merge_${tag}` },
    });
    const source = await prisma.contact.create({
      data: { firstName: 'Kaynak', lastName: `Merge_${tag}` },
    });
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { take: 1, orderBy: { position: 'asc' } } },
    });
    const deal = await prisma.deal.create({
      data: {
        title: `MergeDeal_${tag}`,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        rank: 1,
        contactId: source.id,
      },
    });

    const r = await request(app.getHttpServer())
      .post(`${base}/data/merge/contacts`)
      .set(auth(adminToken))
      .send({ targetId: target.id, sourceId: source.id })
      .expect(201);
    expect(r.body.data.merged).toBe(true);
    expect(r.body.data.movedDeals).toBe(1);

    // Deal artık hedefe bağlı; kaynak silinmiş.
    const movedDeal = await prisma.deal.findUnique({ where: { id: deal.id } });
    expect(movedDeal?.contactId).toBe(target.id);
    const goneSource = await prisma.contact.findUnique({
      where: { id: source.id },
    });
    expect(goneSource).toBeNull();

    // Temizlik.
    await prisma.deal.delete({ where: { id: deal.id } });
  });

  it('POST /data/merge/contacts: hedef=kaynak → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/data/merge/contacts`)
      .set(auth(adminToken))
      .send({
        targetId: '11111111-1111-1111-1111-111111111111',
        sourceId: '11111111-1111-1111-1111-111111111111',
      })
      .expect(400));
});
