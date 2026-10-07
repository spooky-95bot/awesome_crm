// src/modules/sales/sales.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';

const RANK_GAP = 1;

export interface SaleLineItemView {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productId: string | null;
}

export interface SaleView {
  id: string;
  title: string;
  contactId: string | null;
  contactName: string | null;
  total: number;
  currency: string;
  items: SaleLineItemView[];
  createdAt: Date;
}

// Deal satır kalemi kaydı (Prisma tipini gevşek karşılar — Decimal alanlar unknown).
interface SaleLineItemRecord {
  id: string;
  description: string;
  quantity: unknown;
  unitPrice: unknown;
  lineTotal: unknown;
  productId: string | null;
}

interface SaleRecord {
  id: string;
  title: string;
  contactId: string | null;
  contactName: string | null;
  value: unknown;
  currency: string;
  createdAt: Date;
  saleLineItems: SaleLineItemRecord[];
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaleDto) {
    const total = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    const sale = await this.prisma.deal.create({
      data: {
        title: dto.customerName || 'Vente',
        contactName: dto.customerName ?? null,
        value: total,
        currency: 'EUR',
        pipeline: { connect: { id: await this.getDefaultPipelineId() } },
        stage: { connect: { id: await this.getDefaultStageId() } },
        rank: RANK_GAP,
        contactId: dto.contactId ?? null,
        saleLineItems: {
          create: dto.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.quantity * item.unitPrice,
            productId: item.productId ?? null,
          })),
        },
      },
      include: { saleLineItems: true },
    });

    return this.toView(sale as unknown as SaleRecord);
  }

  async findAll(contactId?: string): Promise<SaleView[]> {
    const deals = await this.prisma.deal.findMany({
      where: {
        saleLineItems: { some: {} },
        ...(contactId ? { contactId } : {}),
      },
      include: { saleLineItems: true },
      orderBy: { createdAt: 'desc' },
    });
    return (deals as unknown as SaleRecord[]).map((d) => this.toView(d));
  }

  async findOne(id: string): Promise<SaleView> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { saleLineItems: true },
    });
    if (!deal) {
      throw new NotFoundException('Vente non trouvée');
    }
    return this.toView(deal as unknown as SaleRecord);
  }

  async stats() {
    const sales = await this.prisma.deal.findMany({
      where: { saleLineItems: { some: {} } },
      include: { saleLineItems: true },
    });

    const totalRevenue = sales.reduce(
      (sum: number, sale: { value: unknown }) => sum + Number(sale.value ?? 0),
      0,
    );
    const saleCount = sales.length;
    const averageBasket = saleCount > 0 ? totalRevenue / saleCount : 0;

    // Prestations les plus vendues (regroupées par produit ou description).
    const productStats = new Map<
      string,
      { name: string; count: number; revenue: number }
    >();
    for (const sale of sales) {
      for (const item of sale.saleLineItems) {
        const key = item.productId ?? item.description;
        const existing =
          productStats.get(key) ??
          { name: item.description, count: 0, revenue: 0 };
        existing.count += Number(item.quantity);
        existing.revenue += Number(item.lineTotal);
        productStats.set(key, existing);
      }
    }

    const topProducts = Array.from(productStats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { totalRevenue, saleCount, averageBasket, topProducts };
  }

  private toView(deal: SaleRecord): SaleView {
    return {
      id: deal.id,
      title: deal.title,
      contactId: deal.contactId,
      contactName: deal.contactName,
      total: Number(deal.value ?? 0),
      currency: deal.currency,
      items: deal.saleLineItems.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        productId: item.productId,
      })),
      createdAt: deal.createdAt,
    };
  }

  private async getDefaultPipelineId(): Promise<string> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!pipeline) {
      throw new NotFoundException('Aucun pipeline par défaut trouvé');
    }
    return pipeline.id;
  }

  private async getDefaultStageId(): Promise<string> {
    const stage = await this.prisma.stage.findFirst({
      where: { pipeline: { isDefault: true } },
      orderBy: { position: 'asc' },
    });
    if (!stage) {
      throw new NotFoundException('Aucune étape par défaut trouvée');
    }
    return stage.id;
  }
}
