// src/modules/market-prices/market-prices.repository.ts
// VERİ ERİŞİMİ: Prisma çağrıları YALNIZCA burada (CompetitorProduct + PricePoint).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarketPricesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByBrand(brandId: string) {
    return this.prisma.competitorProduct.findMany({
      where: { brandId },
      orderBy: { name: 'asc' },
      include: { prices: { orderBy: { capturedAt: 'desc' }, take: 12 } },
    });
  }

  findByName(brandId: string, name: string) {
    return this.prisma.competitorProduct.findFirst({
      where: { brandId, name },
    });
  }

  findById(id: string) {
    return this.prisma.competitorProduct.findFirst({ where: { id } });
  }

  create(data: Prisma.CompetitorProductUncheckedCreateInput) {
    return this.prisma.competitorProduct.create({ data });
  }

  updatePrice(id: string, price: Prisma.Decimal | number, currency?: string) {
    return this.prisma.competitorProduct.update({
      where: { id },
      data: { price, ...(currency ? { currency } : {}) },
    });
  }

  addPricePoint(productId: string, price: Prisma.Decimal | number) {
    return this.prisma.pricePoint.create({ data: { productId, price } });
  }

  delete(id: string) {
    return this.prisma.competitorProduct.delete({ where: { id } });
  }
}
