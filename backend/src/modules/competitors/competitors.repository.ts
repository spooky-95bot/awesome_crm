// src/modules/competitors/competitors.repository.ts
// VERİ ERİŞİMİ: Prisma çağrıları YALNIZCA burada (Competitor).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompetitorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CompetitorUncheckedCreateInput) {
    return this.prisma.competitor.create({ data });
  }

  createMany(data: Prisma.CompetitorUncheckedCreateInput[]) {
    return this.prisma.competitor.createMany({ data });
  }

  listByBrand(brandId: string) {
    return this.prisma.competitor.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
    });
  }

  existingNames(brandId: string) {
    return this.prisma.competitor.findMany({
      where: { brandId },
      select: { name: true },
    });
  }

  findById(id: string) {
    return this.prisma.competitor.findFirst({ where: { id } });
  }

  update(id: string, data: Prisma.CompetitorUpdateInput) {
    return this.prisma.competitor.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.competitor.delete({ where: { id } });
  }
}
