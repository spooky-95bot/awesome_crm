// backend/test/tenancy-jwt.e2e-spec.ts — v2.10 JWT claim tabanlı tenant izolasyonu.
// Kullanıcı kendi tenant'ına KİLİTLİ (x-tenant-id başlığı JWT'yi EZEMEZ).
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
const ts = Date.now();

describe('Multi-tenancy — JWT claim izolasyonu (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let tokenA: string;
  let tokenB: string;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let pipelineId: string;
  let stageId: string;
  let dealA: string;

  const adminEmail = process.env.SEED_ADMIN_EMAIL!;
  const adminPw = process.env.SEED_ADMIN_PASSWORD!;
  const emailA = `ta_${ts}@crm.dev`;
  const emailB = `tb_${ts}@crm.dev`;
  const userPw = 'TenantPw!2026';
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  const login = async (email: string, password: string) =>
    (
      await request(app.getHttpServer())
        .post(`${base}/auth/login`)
        .send({ email, password })
        .expect(200)
    ).body.data.accessToken as string;

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

    adminToken = await login(adminEmail, adminPw);

    // Tenant A/B oluştur (platform-admin).
    tenantAId = (
      await request(app.getHttpServer())
        .post(`${base}/tenants`)
        .set(bearer(adminToken))
        .send({ name: 'Tenant A', slug: `ta-${ts}` })
        .expect(201)
    ).body.data.id;
    tenantBId = (
      await request(app.getHttpServer())
        .post(`${base}/tenants`)
        .set(bearer(adminToken))
        .send({ name: 'Tenant B', slug: `tb-${ts}` })
        .expect(201)
    ).body.data.id;

    // İki kullanıcı kaydet + SALES rolü ata + tenant ata.
    userAId = (
      await request(app.getHttpServer())
        .post(`${base}/auth/register`)
        .send({
          email: emailA,
          password: userPw,
          firstName: 'A',
          lastName: 'User',
        })
        .expect(201)
    ).body.data.id;
    userBId = (
      await request(app.getHttpServer())
        .post(`${base}/auth/register`)
        .send({
          email: emailB,
          password: userPw,
          firstName: 'B',
          lastName: 'User',
        })
        .expect(201)
    ).body.data.id;

    const sales = await prisma.role.findFirstOrThrow({
      where: { name: 'SALES' },
    });
    await prisma.userRole.createMany({
      data: [
        { userId: userAId, roleId: sales.id },
        { userId: userBId, roleId: sales.id },
      ],
    });

    await request(app.getHttpServer())
      .post(`${base}/tenants/${tenantAId}/assign-user`)
      .set(bearer(adminToken))
      .send({ userId: userAId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base}/tenants/${tenantBId}/assign-user`)
      .set(bearer(adminToken))
      .send({ userId: userBId })
      .expect(201);

    tokenA = await login(emailA, userPw);
    tokenB = await login(emailB, userPw);

    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { isDefault: true },
      include: { stages: { take: 1, orderBy: { position: 'asc' } } },
    });
    pipelineId = pipeline.id;
    stageId = pipeline.stages[0].id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.deal.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: [userAId, userBId] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [userAId, userBId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [userAId, userBId] } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [tenantAId, tenantBId] } },
      });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it("Login token'ı tenant claim taşır (A kullanıcısı deal oluşturur → tenant A)", async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/deals`)
      .set(bearer(tokenA))
      .send({ pipelineId, stageId, title: `TJ_${ts}` })
      .expect(201);
    dealA = r.body.data.id;
    const row = await prisma.deal.findUnique({ where: { id: dealA } });
    expect(row?.tenantId).toBe(tenantAId);
  });

  it("Tenant B kullanıcısı A deal'ini GÖREMEZ (izolasyon)", async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/deals?pipelineId=${pipelineId}`)
      .set(bearer(tokenB))
      .expect(200);
    const ids = r.body.data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(dealA);
  });

  it('Tenant B kullanıcısı A deal :id → 404 (cross-tenant engeli)', () =>
    request(app.getHttpServer())
      .get(`${base}/deals/${dealA}`)
      .set(bearer(tokenB))
      .expect(404));

  it('x-tenant-id başlığı JWT claim’i EZEMEZ (A kullanıcı B başlığıyla bile A görür)', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/deals?pipelineId=${pipelineId}`)
      .set(bearer(tokenA))
      .set('x-tenant-id', tenantBId)
      .expect(200);
    const ids = r.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(dealA); // JWT (A) öncelikli → A görünür
  });

  it('Platform-admin (tenant=null) tenant.manage uçlarına erişir; SALES → 403', () =>
    request(app.getHttpServer())
      .get(`${base}/tenants`)
      .set(bearer(tokenA))
      .expect(403));
});
