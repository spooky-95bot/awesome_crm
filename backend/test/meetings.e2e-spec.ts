// backend/test/meetings.e2e-spec.ts — v2.2 takvim/toplantı.
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

describe('Meetings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let salesToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let meetingId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `meet_sales_${ts}@crm.dev`;
  const financeEmail = `meet_fin_${ts}@crm.dev`;
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
          firstName: 'M',
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
      await prisma.meeting.deleteMany({ where: { title: `Mtg_${ts}` } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('SALES POST /meetings → 201', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/meetings`)
      .set(auth(salesToken))
      .send({
        title: `Mtg_${ts}`,
        startsAt: '2026-07-01T10:00:00.000Z',
        endsAt: '2026-07-01T11:00:00.000Z',
        location: 'Online',
      })
      .expect(201);
    meetingId = r.body.data.id;
  });

  it('endsAt <= startsAt → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/meetings`)
      .set(auth(salesToken))
      .send({
        title: `Mtg_${ts}`,
        startsAt: '2026-07-01T11:00:00.000Z',
        endsAt: '2026-07-01T10:00:00.000Z',
      })
      .expect(400));

  it('FINANCE POST /meetings → 403 (meeting.create yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/meetings`)
      .set(auth(financeToken))
      .send({
        title: `Mtg_${ts}`,
        startsAt: '2026-07-01T10:00:00.000Z',
        endsAt: '2026-07-01T11:00:00.000Z',
      })
      .expect(403));

  it('SALES GET /meetings → 200, oluşturulan görünür', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/meetings`)
      .set(auth(salesToken))
      .expect(200);
    expect(r.body.data.map((m: { id: string }) => m.id)).toContain(meetingId);
  });

  it('SALES DELETE /meetings/:id → 200', () =>
    request(app.getHttpServer())
      .delete(`${base}/meetings/${meetingId}`)
      .set(auth(salesToken))
      .expect(200));
});
