// backend/prisma/seed-demo.ts
// Demo verisi: her rol için test kullanıcısı + örnek lead'ler + faturalar (idempotent).
// Çalıştırma: npm run seed:demo   (önce ana seed: npm run seed)
import { PrismaClient, InvoiceStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_USERS = [
  { email: 'manager@crm.dev', firstName: 'Mira', lastName: 'Manager', role: 'MANAGER' },
  { email: 'sales@crm.dev', firstName: 'Sami', lastName: 'Sales', role: 'SALES' },
  { email: 'finance@crm.dev', firstName: 'Feyza', lastName: 'Finance', role: 'FINANCE' },
  { email: 'viewer@crm.dev', firstName: 'Vera', lastName: 'Viewer', role: 'VIEWER' },
];

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seeding is disabled unless ALLOW_DEMO_SEED=true outside production.');
  }
  const demoPassword = process.env.DEMO_SEED_PASSWORD;
  if (!demoPassword || demoPassword.length < 16 || /^(change[-_ ]?me|example|sample|demo|placeholder|replace[-_ ]?me|password)/i.test(demoPassword)) {
    throw new Error('A private, non-placeholder DEMO_SEED_PASSWORD of at least 16 characters is required.');
  }
  const cost = Number(process.env.BCRYPT_COST ?? 12);
  const passwordHash = await bcrypt.hash(demoPassword, cost);

  // 1) Rol bazlı test kullanıcıları
  const userIdByRole: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const role = await prisma.role.findUnique({ where: { name: u.role } });
    if (!role) continue;
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    userIdByRole[u.role] = user.id;
  }

  // 2) Örnek deal'ler (varsayılan pipeline) — yalnız hiç yoksa oluştur.
  const pipeline = await prisma.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { position: 'asc' } } },
  });
  const salesId = userIdByRole['SALES'];
  if (pipeline && salesId) {
    const existing = await prisma.deal.count({
      where: { pipelineId: pipeline.id, deletedAt: null },
    });
    if (existing === 0) {
      const samples = [
        { title: 'ACME yazılım teklifi', company: 'ACME A.Ş.', value: '120000.00', stage: 0 },
        { title: 'Beta entegrasyon', company: 'Beta Ltd.', value: '45000.00', stage: 0 },
        { title: 'Gamma danışmanlık', company: 'Gamma', value: '30000.00', stage: 1 },
        { title: 'Delta yıllık bakım', company: 'Delta', value: '18000.00', stage: 2 },
        { title: 'Epsilon kazanıldı', company: 'Epsilon', value: '90000.00', stage: 3 },
      ];
      let rank = 1;
      for (const s of samples) {
        await prisma.deal.create({
          data: {
            pipelineId: pipeline.id,
            stageId: pipeline.stages[s.stage].id,
            title: s.title,
            company: s.company,
            value: s.value,
            rank: rank++,
            ownerId: salesId,
            status: s.stage === 3 ? 'WON' : 'OPEN',
          },
        });
      }
    }
  }

  // 3) Örnek faturalar (finance) — yalnız hiç yoksa.
  const financeId = userIdByRole['FINANCE'];
  if (financeId) {
    const invCount = await prisma.invoice.count();
    if (invCount === 0) {
      // DRAFT fatura
      await prisma.invoice.create({
        data: {
          customerName: 'ACME A.Ş.',
          customerEmail: 'muhasebe@acme.test',
          status: InvoiceStatus.DRAFT,
          subtotal: '10000.00',
          taxRate: '20',
          taxAmount: '2000.00',
          total: '12000.00',
          createdById: financeId,
          lineItems: {
            create: [
              { description: 'Danışmanlık (2 gün)', quantity: '2', unitPrice: '5000.00', lineTotal: '10000.00' },
            ],
          },
        },
      });
      // Ödenmiş (PAID) fatura
      await prisma.invoice.create({
        data: {
          number: 'INV-2026-000900',
          customerName: 'Beta Ltd.',
          status: InvoiceStatus.PAID,
          subtotal: '5000.00',
          taxRate: '20',
          taxAmount: '1000.00',
          total: '6000.00',
          amountPaid: '6000.00',
          issuedAt: new Date(),
          createdById: financeId,
          lineItems: {
            create: [
              { description: 'Lisans (yıllık)', quantity: '1', unitPrice: '5000.00', lineTotal: '5000.00' },
            ],
          },
          payments: {
            create: [{ amount: '6000.00', method: 'BANK', recordedById: financeId }],
          },
        },
      });
    }
  }

  // 4) Örnek Company + Contact (yalnız hiç yoksa).
  const salesOwner = userIdByRole['SALES'];
  if ((await prisma.company.count()) === 0) {
    const acme = await prisma.company.create({
      data: {
        name: 'ACME A.Ş.',
        domain: 'acme.test',
        industry: 'Yazılım',
        ownerId: salesOwner,
      },
    });
    const beta = await prisma.company.create({
      data: { name: 'Beta Ltd.', domain: 'beta.test', industry: 'Danışmanlık', ownerId: salesOwner },
    });
    await prisma.contact.createMany({
      data: [
        { firstName: 'Ayşe', lastName: 'Yılmaz', email: 'ayse@acme.test', title: 'Satınalma', companyId: acme.id, ownerId: salesOwner },
        { firstName: 'Mehmet', lastName: 'Demir', email: 'mehmet@beta.test', title: 'CTO', companyId: beta.id, ownerId: salesOwner },
      ],
    });
  }

  // 5) Örnek nitelenmemiş Lead'ler (yalnız hiç yoksa).
  if ((await prisma.lead.count()) === 0 && salesOwner) {
    await prisma.lead.createMany({
      data: [
        { firstName: 'Deniz', lastName: 'Kaya', email: 'deniz@aday.test', companyName: 'Yeni Müşteri A', source: 'WEB', ownerId: salesOwner },
        { firstName: 'Ece', lastName: 'Şahin', email: 'ece@aday.test', companyName: 'Yeni Müşteri B', source: 'REFERRAL', ownerId: salesOwner },
      ],
    });
  }

  console.log(`Demo records seeded for local testing (${DEMO_USERS.length} account fixtures).`);
}

main()
  .catch((e) => {
    console.error('Demo seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
