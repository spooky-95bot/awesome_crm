// backend/prisma/seed.ts
// Faz 2: tüm izinler + 5 varsayılan rol (izin eşlemeleriyle) + admin kullanıcı.
// Idempotent — tekrar çalıştırılabilir.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_NAMES,
} from '../src/common/constants/permission.enum';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (
    !adminEmail ||
    !adminPassword ||
    /@crm\.dev$/i.test(adminEmail) ||
    adminPassword.length < 20 ||
    /^(change[-_ ]?me|example|sample|demo|placeholder|replace[-_ ]?me|password)/i.test(adminPassword)
  ) {
    throw new Error('A private, non-placeholder SEED_ADMIN_EMAIL and strong SEED_ADMIN_PASSWORD are required before seeding.');
  }
  const bcryptCost = Number(process.env.BCRYPT_COST ?? 12);

  // 1) Tüm izinler.
  for (const action of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { action },
      update: {},
      create: { action },
    });
  }
  const allPerms = await prisma.permission.findMany({
    select: { id: true, action: true },
  });
  const permIdByAction = new Map(allPerms.map((p) => [p.action, p.id]));

  // 2) Varsayılan roller + izin eşlemeleri.
  for (const [roleName, actions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} rolü` },
    });
    for (const action of actions) {
      const permissionId = permIdByAction.get(action);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // 3) Admin kullanıcı + ADMIN rolü.
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: ROLE_NAMES.ADMIN },
  });
  const passwordHash = await bcrypt.hash(adminPassword, bcryptCost);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      isActive: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // 4) Varsayılan pipeline + stage'ler (idempotent).
  let pipeline = await prisma.pipeline.findFirst({ where: { isDefault: true } });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        name: 'Satış Hattı',
        isDefault: true,
        stages: {
          create: [
            { name: 'Yeni', position: 0 },
            { name: 'İletişim', position: 1 },
            { name: 'Teklif', position: 2 },
            { name: 'Kazanıldı', position: 3, isWon: true },
            { name: 'Kaybedildi', position: 4, isLost: true },
          ],
        },
      },
    });
  }

  // Güvenlik: düz parola loglanmaz.
  console.log(
    `Seed tamam. İzinler: ${ALL_PERMISSIONS.length}, roller: ${
      Object.keys(DEFAULT_ROLE_PERMISSIONS).length
    }. Admin: ${adminEmail} (ADMIN). Pipeline: ${pipeline.name} (5 stage).`,
  );
}

main()
  .catch((e) => {
    console.error('Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
