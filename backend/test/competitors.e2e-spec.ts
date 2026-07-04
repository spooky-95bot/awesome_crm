// backend/test/competitors.e2e-spec.ts
// E2E — v4.1 rakip kaydı: elle ekle, listele, AI önerilerini içe aktar (çift atla), RBAC, sil.
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

describe('Competitors (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let brandId: string;
  let compId: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const finEmail = `comp_fin_${ts}@crm.dev`;
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@crm.dev';
  const adminPw = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';
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
        email: finEmail,
        password: pw,
        firstName: 'C',
        lastName: 'O',
        roleIds: [roleId.FINANCE],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    financeToken = (await login(finEmail, pw).expect(200)).body.data
      .accessToken;

    // Marka + enrich (AI yok → fallback; suggestedCompetitors boş olur → elle set edelim)
    const brand = await request(app.getHttpServer())
      .post(`${base}/brands`)
      .set(auth(adminToken))
      .send({ name: `CompBrand_${ts}`, niche: 'Erkek sokak giyimi' })
      .expect(201);
    brandId = brand.body.data.id;
    // AI önerisi normalde enrich üretir; testte doğrudan answers'a yazıyoruz.
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        answers: { suggestedCompetitors: ['ÖneriX', 'ÖneriY', 'ÖneriX'] },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.competitor.deleteMany({ where: { brandId } });
      if (brandId) await prisma.brand.deleteMany({ where: { id: brandId } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('FINANCE POST rakip → 403', () =>
    request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/competitors`)
      .set(auth(financeToken))
      .send({ name: 'x' })
      .expect(403));

  it('ADMIN elle rakip ekle → 201 (source manual)', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/competitors`)
      .set(auth(adminToken))
      .send({ name: 'RakipManuel', domain: 'rakip.com' })
      .expect(201);
    compId = r.body.data.id;
    expect(r.body.data.source).toBe('manual');
  });

  it('AI önerilerini içe aktar → çift atlanır (2 benzersiz)', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/competitors/import-suggested`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.added).toBe(2); // ÖneriX, ÖneriY (tekrar eden ÖneriX atlandı)
    // tekrar çalıştır → 0 (hepsi zaten var)
    const again = await request(app.getHttpServer())
      .post(`${base}/brands/${brandId}/competitors/import-suggested`)
      .set(auth(adminToken))
      .expect(200);
    expect(again.body.data.added).toBe(0);
  });

  it('GET rakipler → manuel + ai_suggested toplam 3', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/brands/${brandId}/competitors`)
      .set(auth(adminToken))
      .expect(200);
    expect(r.body.data.length).toBe(3);
    const sources = r.body.data.map((c: { source: string }) => c.source);
    expect(sources).toContain('manual');
    expect(sources).toContain('ai_suggested');
  });

  it('DELETE competitor → 200', () =>
    request(app.getHttpServer())
      .delete(`${base}/competitors/${compId}`)
      .set(auth(adminToken))
      .expect(200));
});
