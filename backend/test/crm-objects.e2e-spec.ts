// backend/test/crm-objects.e2e-spec.ts
// v2.1a E2E — Company + Contact CRUD, ilişki ve RBAC.
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

describe('CRM objects: Company & Contact (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let viewerToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let companyId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const viewerEmail = `crm_viewer_${ts}@crm.dev`;
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

    const v = await request(app.getHttpServer())
      .post(`${base}/users`)
      .set(auth(adminToken))
      .send({
        email: viewerEmail,
        password: pw,
        firstName: 'V',
        lastName: 'R',
        roleIds: [roleId.VIEWER],
      })
      .expect(201);
    testUserIds.push(v.body.data.id);
    viewerToken = (await login(viewerEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.contact.deleteMany({ where: { firstName: `CT_${ts}` } });
      await prisma.company.deleteMany({ where: { name: `Co_${ts}` } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('ADMIN POST /companies → 201', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/companies`)
      .set(auth(adminToken))
      .send({ name: `Co_${ts}`, domain: 'co.test', industry: 'Yazılım' })
      .expect(201);
    companyId = r.body.data.id;
    expect(r.body.data.contactCount).toBe(0);
  });

  it('VIEWER POST /companies → 403; GET → 200', async () => {
    await request(app.getHttpServer())
      .post(`${base}/companies`)
      .set(auth(viewerToken))
      .send({ name: `Co_${ts}_x` })
      .expect(403);
    await request(app.getHttpServer())
      .get(`${base}/companies`)
      .set(auth(viewerToken))
      .expect(200);
  });

  it('POST /contacts şirkete bağlı → 201, company görünür', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/contacts`)
      .set(auth(adminToken))
      .send({
        firstName: `CT_${ts}`,
        lastName: 'Kişi',
        email: 'k@co.test',
        companyId,
      })
      .expect(201);
    expect(r.body.data.company?.id).toBe(companyId);
  });

  it('POST /contacts geçersiz companyId → 400', () =>
    request(app.getHttpServer())
      .post(`${base}/contacts`)
      .set(auth(adminToken))
      .send({
        firstName: `CT_${ts}`,
        lastName: 'X',
        companyId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(400));

  it('GET /contacts?companyId= → filtrelenir', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/contacts?companyId=${companyId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
    expect(r.body.meta.total).toBeGreaterThanOrEqual(1);
  });
});
