// src/modules/brands/brands.repository.ts
// VERİ ERİŞİMİ: Prisma çağrıları YALNIZCA burada (Brand). Tenant scope middleware'de.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BrandsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.BrandUncheckedCreateInput) {
    return this.prisma.brand.create({ data });
  }

  findById(id: string) {
    return this.prisma.brand.findFirst({ where: { id } });
  }

  async list(where: Prisma.BrandWhereInput, skip: number, take: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.brand.count({ where }),
    ]);
    return { items, total };
  }

  update(id: string, data: Prisma.BrandUpdateInput) {
    return this.prisma.brand.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.brand.delete({ where: { id } });
  }
}
