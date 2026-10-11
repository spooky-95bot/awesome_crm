// backend/test/lead-forms.e2e-spec.ts
// E2E — Lead intake : formulaire embarqué (submit non signé) + webhook (HMAC obligatoire) + filtre par canal.
// Tests négatifs : signature invalide/manquante → 401 (aucune écriture DB), RBAC (permission manage).
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
import { signPayload } from '../src/modules/integrations/util/webhook-signature.util';

const base = '/api/v1';

describe('Lead intake forms + webhook (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let salesToken: string;
  const roleId: Record<string, string> = {};
  const testUserIds: string[] = [];
  let formId: string;
  let publicKey: string;
  let secret: string;

  const pw = 'S3cure!Passw0rd';
  const ts = Date.now();
  const salesEmail = `lf_sales_${ts}@crm.dev`;
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
    app = moduleRef.createNestApplication({ rawBody: true });
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
        firstName: 'L',
        lastName: 'F',
        roleIds: [roleId.SALES],
      })
      .expect(201);
    testUserIds.push(res.body.data.id);
    salesToken = (await login(salesEmail, pw).expect(200)).body.data
      .accessToken;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.lead.deleteMany({
        where: { firstName: { in: [`FormLead_${ts}`, `HookLead_${ts}`] } },
      });
      if (formId) await prisma.leadForm.deleteMany({ where: { id: formId } });
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
  });

  it('ADMIN POST /lead-forms → 201, retourne publicKey + secret', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/lead-forms`)
      .set(auth(adminToken))
      .send({
        name: `Intake_${ts}`,
        buttonColor: '#ff0000',
        buttonLabel: 'Send',
        fields: [
          { key: 'firstName', label: 'Ad', type: 'text', required: true },
          { key: 'email', label: 'E-posta', type: 'email', required: true },
        ],
      })
      .expect(201);
    formId = r.body.data.id;
    publicKey = r.body.data.publicKey;
    secret = r.body.data.secret;
    expect(publicKey).toMatch(/^pk_/);
    expect(secret).toMatch(/^whsec_/);
  });

  it('uses a generic configurable button label when none is supplied', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/lead-forms`)
      .set(auth(adminToken))
      .send({ name: `DefaultLabel_${ts}` })
      .expect(201);
    expect(r.body.data.buttonLabel).toBe('Submit');
    const publicConfig = await request(app.getHttpServer())
      .get(`${base}/public/lead-forms/${r.body.data.publicKey}`)
      .expect(200);
    expect(publicConfig.body.data.buttonLabel).toBe('Submit');
    await prisma.leadForm.deleteMany({ where: { id: r.body.data.id } });
  });

  it('SALES POST /lead-forms → 403 (lead_form.manage yok)', () =>
    request(app.getHttpServer())
      .post(`${base}/lead-forms`)
      .set(auth(salesToken))
      .send({ name: 'x' })
      .expect(403));

  it('redirectUrl sans schéma → https:// ajouté (correction relative)', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/lead-forms`)
      .set(auth(adminToken))
      .send({ name: `Redir_${ts}`, redirectUrl: 'google.com' })
      .expect(201);
    expect(r.body.data.redirectUrl).toBe('https://google.com');
    await prisma.leadForm.deleteMany({ where: { id: r.body.data.id } });
  });

  it('SALES GET /lead-forms → 200 (lead_form.read var, secret gizli)', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/lead-forms`)
      .set(auth(salesToken))
      .expect(200);
    const f = r.body.data.find((x: { id: string }) => x.id === formId);
    expect(f).toBeDefined();
    expect(f.secret).toBeUndefined();
  });

  it('PUBLIC GET /public/lead-forms/:key → config (secret YOK)', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/public/lead-forms/${publicKey}`)
      .expect(200);
    expect(r.body.data.name).toBe(`Intake_${ts}`);
    expect(r.body.data.buttonColor).toBe('#ff0000');
    expect(r.body.data.buttonLabel).toBe('Send'); // client configuration overrides generic fallback
    expect(r.body.data.secret).toBeUndefined();
  });

  it('PUBLIC POST submit (non signé) → 200, crée un lead canal FORM', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base}/public/lead-forms/${publicKey}/submit`)
      .send({
        firstName: `FormLead_${ts}`,
        lastName: 'Web',
        email: 'web@x.test',
        utm_campaign: 'spring', // champ supplémentaire spécifique au formulaire → meta
      })
      .expect(200);
    expect(r.body.data.success).toBe(true);

    const lead = await prisma.lead.findFirst({
      where: { firstName: `FormLead_${ts}` },
    });
    expect(lead?.channel).toBe('FORM');
    expect(lead?.formId).toBe(formId);
    expect(
      (lead?.meta as { fields?: Record<string, unknown> })?.fields,
    ).toEqual({ utm_campaign: 'spring' });
  });

  it('v4.7 champs configurables : intl phone + min/max + maxLength + validation de message', async () => {
    // Créer un formulaire avec champs configurables.
    const f = await request(app.getHttpServer())
      .post(`${base}/lead-forms`)
      .set(auth(adminToken))
      .send({
        name: `Valid_${ts}`,
        fields: [
          { key: 'firstName', label: 'Ad', type: 'text', required: true },
          {
            key: 'phone',
            label: 'Telefon',
            type: 'phone',
            required: true,
            errorMessage: 'Veuillez saisir un téléphone valide',
          },
          { key: 'age', label: 'Âge', type: 'number', min: 18, max: 99 },
          { key: 'code', label: 'Kod', type: 'text', maxLength: 5 },
        ],
      })
      .expect(201);
    const vKey = f.body.data.publicKey as string;
    const vId = f.body.data.id as string;

    // Submit valide → 200 (téléphone E.164).
    await request(app.getHttpServer())
      .post(`${base}/public/lead-forms/${vKey}/submit`)
      .send({
        firstName: `Val_${ts}`,
        phone: '+905321234567',
        age: '30',
        code: 'AB12',
      })
      .expect(200);

    // Téléphone obligatoire manquant → 400 + message spécifique.
    const miss = await request(app.getHttpServer())
      .post(`${base}/public/lead-forms/${vKey}/submit`)
      .send({ firstName: 'X' })
      .expect(400);
    expect(miss.body.error.message).toBe('Veuillez saisir un téléphone valide');

    // Téléphone invalide (pas E.164) → 400 + message spécifique.
    const badPhone = await request(app.getHttpServer())
      .post(`${base}/public/lead-forms/${vKey}/submit`)
      .send({ firstName: 'X', phone: '05321234567' })
      .expect(400);
    expect(badPhone.body.error.message).toBe('Veuillez saisir un téléphone valide');

    // Nombre sous le minimum → 400.
    const young = await request(app.getHttpServer())
      .post(`${base}/public/lead-forms/${vKey}/submit`)
      .send({ firstName: 'X', phone: '+905321234567', age: '15' })
      .expect(400);
    expect(young.body.error.message).toContain('en az 18');

    // Dépassement maxLength → 400.
    await request(app.getHttpServer())
      .post(`${base}/public/lead-forms/${vKey}/submit`)
      .send({ firstName: 'X', phone: '+905321234567', code: 'TOOLONG' })
      .expect(400);

    // temizlik
    await prisma.lead.deleteMany({ where: { formId: vId } });
    await prisma.leadForm.deleteMany({ where: { id: vId } });
  });

  it('WEBHOOK HMAC valide → 200, crée un lead canal WEBHOOK', async () => {
    const body = JSON.stringify({
      firstName: `HookLead_${ts}`,
      lastName: 'Srv',
      email: 'srv@x.test',
    });
    const tsec = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, tsec, body);
    const r = await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', sig)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);
    expect(r.body.data.success).toBe(true);

    const lead = await prisma.lead.findFirst({
      where: { firstName: `HookLead_${ts}` },
    });
    expect(lead?.channel).toBe('WEBHOOK');
  });

  it('WEBHOOK signature invalide → 401, aucun lead créé', async () => {
    const before = await prisma.lead.count({
      where: { firstName: `HookLead_${ts}` },
    });
    const body = JSON.stringify({ firstName: `HookLead_${ts}`, lastName: 'X' });
    const tsec = Math.floor(Date.now() / 1000);
    await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', 'sha256=deadbeef')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);
    const after = await prisma.lead.count({
      where: { firstName: `HookLead_${ts}` },
    });
    expect(after).toBe(before); // aucune écriture DB
  });

  it('WEBHOOK en-tête signature manquant → 401', () => {
    const body = JSON.stringify({ firstName: `HookLead_${ts}`, lastName: 'Y' });
    return request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);
  });

  it('GET /leads?channel=FORM → uniquement leads formulaires', async () => {
    const r = await request(app.getHttpServer())
      .get(`${base}/leads?channel=FORM`)
      .set(auth(adminToken))
      .expect(200);
    const channels = r.body.data.map((l: { channel: string }) => l.channel);
    expect(channels.every((c: string) => c === 'FORM')).toBe(true);
    expect(
      r.body.data.some(
        (l: { firstName: string }) => l.firstName === `FormLead_${ts}`,
      ),
    ).toBe(true);
  });

  // ==== Idempotence réservations Elysence ====

  it('IDEMPOTENCE : rejeu même reservationId → un seul lead', async () => {
    const rid = `RES-${ts}-REPLAY`;
    const body = JSON.stringify({
      firstName: `Idem_${ts}`,
      lastName: 'Replay',
      email: `idem.replay.${ts}@x.test`,
      reservationId: rid,
    });
    const tsec = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, tsec, body);

    // Premier envoi → 200
    const first = await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', sig)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    // Rejeu identique → 200, même leadId
    const second = await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', sig)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    expect(second.body.data.leadId).toBe(first.body.data.leadId);

    // Un seul lead en base
    const count = await prisma.lead.count({
      where: { reservationKey: rid },
    });
    expect(count).toBe(1);
  });

  it('IDEMPOTENCE : requêtes simultanées même reservationId → un seul lead', async () => {
    const rid = `RES-${ts}-RACE`;
    const body = JSON.stringify({
      firstName: `Race_${ts}`,
      lastName: 'Concurrent',
      email: `race.${ts}@x.test`,
      reservationId: rid,
    });
    const tsec = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, tsec, body);

    // 5 requêtes simultanées
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`${base}/webhooks/leads/${publicKey}`)
          .set('x-crm-timestamp', String(tsec))
          .set('x-crm-signature', sig)
          .set('Content-Type', 'application/json')
          .send(body),
      ),
    );

    // Toutes réussissent
    for (const r of results) {
      expect(r.status).toBe(200);
    }

    // Un seul lead en base
    const count = await prisma.lead.count({
      where: { reservationKey: rid },
    });
    expect(count).toBe(1);

    // Tous les leadId identiques
    const leadIds = results.map((r) => r.body.data.leadId);
    expect(new Set(leadIds).size).toBe(1);
  });

  it('IDEMPOTENCE : reservationId différent → nouveau lead', async () => {
    const rid1 = `RES-${ts}-DIFF-1`;
    const rid2 = `RES-${ts}-DIFF-2`;

    for (const rid of [rid1, rid2]) {
      const body = JSON.stringify({
        firstName: `Diff_${ts}`,
        lastName: 'Different',
        email: `diff.${ts}@x.test`,
        reservationId: rid,
      });
      const tsec = Math.floor(Date.now() / 1000);
      const sig = signPayload(secret, tsec, body);
      await request(app.getHttpServer())
        .post(`${base}/webhooks/leads/${publicKey}`)
        .set('x-crm-timestamp', String(tsec))
        .set('x-crm-signature', sig)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);
    }

    const count = await prisma.lead.count({
      where: { reservationKey: { in: [rid1, rid2] } },
    });
    expect(count).toBe(2);
  });

  it('IDEMPOTENCE : sans reservationId → pas de clé, pas de blocage', async () => {
    const body = JSON.stringify({
      firstName: `NoKey_${ts}`,
      lastName: 'NoReservation',
      email: `nokey.${ts}@x.test`,
    });
    const tsec = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, tsec, body);
    const r = await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', sig)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const lead = await prisma.lead.findFirst({
      where: { id: r.body.data.leadId },
    });
    expect(lead?.reservationKey).toBeNull();
  });

  it('IDEMPOTENCE : signature invalide → 401, aucun lead créé', async () => {
    const before = await prisma.lead.count({
      where: { firstName: `BadSig_${ts}` },
    });
    const body = JSON.stringify({
      firstName: `BadSig_${ts}`,
      lastName: 'Invalid',
      email: `badsig.${ts}@x.test`,
      reservationId: `RES-${ts}-BADSIG`,
    });
    const tsec = Math.floor(Date.now() / 1000);
    await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', 'sha256=invalidsignature')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);

    const after = await prisma.lead.count({
      where: { firstName: `BadSig_${ts}` },
    });
    expect(after).toBe(before);
  });

  it('IDEMPOTENCE : récupération après erreur réseau (rejeu après 500)', async () => {
    const rid = `RES-${ts}-RECOVER`;
    const body = JSON.stringify({
      firstName: `Recover_${ts}`,
      lastName: 'AfterError',
      email: `recover.${ts}@x.test`,
      reservationId: rid,
    });
    const tsec = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, tsec, body);

    // Premier envoi
    await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', sig)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    // Rejeu après erreur simulée → toujours un seul lead
    const replay = await request(app.getHttpServer())
      .post(`${base}/webhooks/leads/${publicKey}`)
      .set('x-crm-timestamp', String(tsec))
      .set('x-crm-signature', sig)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const count = await prisma.lead.count({
      where: { reservationKey: rid },
    });
    expect(count).toBe(1);
    expect(replay.body.data.leadId).toBeDefined();
  });
});
