// src/modules/growth/growth.repository.ts
// VERİ ERİŞİMİ: Prisma çağrıları YALNIZCA burada — büyüme paneli için sinyal toplulaştırma.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GrowthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async signals(brandId: string) {
    const [competitors, savedAds, products, priceAgg] = await Promise.all([
      this.prisma.competitor.count({ where: { brandId } }),
      this.prisma.savedAd.count({ where: { brandId } }),
      this.prisma.competitorProduct.count({ where: { brandId } }),
      this.prisma.competitorProduct.aggregate({
        where: { brandId },
        _avg: { price: true },
        _min: { price: true },
        _max: { price: true },
      }),
    ]);
    return {
      competitors,
      savedAds,
      products,
      avgPrice: priceAgg._avg.price ? Number(priceAgg._avg.price) : null,
      minPrice: priceAgg._min.price ? Number(priceAgg._min.price) : null,
      maxPrice: priceAgg._max.price ? Number(priceAgg._max.price) : null,
    };
  }
}
