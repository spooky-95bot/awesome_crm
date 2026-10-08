// src/modules/products/products.service.ts
// İŞ MANTIĞI: Ürün kataloğu CRUD. Para alanları Decimal (string olarak döner).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ProductsRepository } from './products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';

const D = Prisma.Decimal;

type ProductRecord = Prisma.ProductGetPayload<object>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly repo: ProductsRepository) {}

  async create(dto: CreateProductDto, actor: AuthenticatedUser) {
    this.assertMoney(dto.unitPrice, dto.taxRate);
    if (dto.sku) {
      const exists = await this.repo.findBySku(dto.sku);
      if (exists) throw new ConflictException('Ce SKU est déjà enregistré.');
    }
    const created = await this.repo.create({
      sku: dto.sku,
      name: dto.name,
      description: dto.description,
      unitPrice: dto.unitPrice,
      currency: dto.currency ?? 'EUR',
      taxRate: dto.taxRate ?? '0',
      active: dto.active ?? true,
    });
    this.logger.log(`product.create by=${actor.id} product=${created.id}`);
    return this.toView(created);
  }

  async findAll(q: QueryProductDto) {
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (q.active !== undefined) where.active = q.active;
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { sku: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const { items, total } = await this.repo.list(where, q.skip, q.limit);
    return {
      data: items.map((p) => this.toView(p)),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async findOne(id: string) {
    return this.toView(await this.getOrThrow(id));
  }

  async update(id: string, dto: UpdateProductDto, actor: AuthenticatedUser) {
    await this.getOrThrow(id);
    if (dto.unitPrice !== undefined || dto.taxRate !== undefined) {
      this.assertMoney(dto.unitPrice, dto.taxRate);
    }
    if (dto.sku) {
      const exists = await this.repo.findBySku(dto.sku);
      if (exists && exists.id !== id) {
        throw new ConflictException('Ce SKU est déjà utilisé par un autre produit.');
      }
    }
    const updated = await this.repo.update(id, {
      sku: dto.sku,
      name: dto.name,
      description: dto.description,
      unitPrice: dto.unitPrice,
      currency: dto.currency,
      taxRate: dto.taxRate,
      active: dto.active,
    });
    this.logger.log(`product.update by=${actor.id} product=${id}`);
    return this.toView(updated);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    await this.getOrThrow(id);
    await this.repo.softDelete(id);
    this.logger.log(`product.delete by=${actor.id} product=${id}`);
    return { deleted: true };
  }

  // --- Yardımcılar ---

  private async getOrThrow(id: string): Promise<ProductRecord> {
    const p = await this.repo.findById(id);
    if (!p) throw new NotFoundException('Produit introuvable');
    return p;
  }

  private assertMoney(unitPrice?: string, taxRate?: string): void {
    if (unitPrice !== undefined && new D(unitPrice).lt(0)) {
      throw new BadRequestException('Le prix unitaire ne peut pas être négatif.');
    }
    if (taxRate !== undefined) {
      const t = new D(taxRate);
      if (t.lt(0) || t.gt(100)) {
        throw new BadRequestException('taxRate doit être compris entre 0 et 100.');
      }
    }
  }

  private toView(p: ProductRecord) {
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      unitPrice: p.unitPrice.toString(),
      currency: p.currency,
      taxRate: p.taxRate.toString(),
      active: p.active,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
