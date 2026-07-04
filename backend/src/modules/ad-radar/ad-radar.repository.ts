// src/modules/ad-radar/ad-radar.repository.ts
// VERİ ERİŞİMİ: Prisma çağrıları YALNIZCA burada (SavedAd).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdRadarRepository {
  constructor(private readonly prisma: PrismaService) {}

  listSaved(brandId: string) {
    return this.prisma.savedAd.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Aynı reklam iki kez kaydedilmesin (brandId+adArchiveId benzersiz).
  upsert(data: Prisma.SavedAdUncheckedCreateInput) {
    return this.prisma.savedAd.upsert({
      where: {
        brandId_adArchiveId: {
          brandId: data.brandId,
          adArchiveId: data.adArchiveId,
        },
      },
      create: data,
      update: {},
    });
  }

  findById(id: string) {
    return this.prisma.savedAd.findFirst({ where: { id } });
  }

  delete(id: string) {
    return this.prisma.savedAd.delete({ where: { id } });
  }
}
