// src/modules/products/products.service.spec.ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const actor: AuthenticatedUser = {
  id: 'u-1',
  email: 'a@crm.dev',
  roles: ['ADMIN'],
  permissions: [],
};

const productRecord = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  sku: null,
  name: 'Lisans',
  description: null,
  unitPrice: new Prisma.Decimal('1000.00'),
  currency: 'EUR',
  taxRate: new Prisma.Decimal('20'),
  active: true,
  tenantId: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('ProductsService', () => {
  let repo: { [k in keyof ProductsRepository]: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      findBySku: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      list: jest.fn(),
    } as unknown as typeof repo;
    service = new ProductsService(repo as unknown as ProductsRepository);
  });

  it('create: Decimal fiyat string olarak korunur', async () => {
    repo.findBySku.mockResolvedValue(null);
    repo.create.mockResolvedValue(
      productRecord({ unitPrice: new Prisma.Decimal('1000.10') }),
    );
    const res = await service.create(
      { name: 'X', unitPrice: '1000.10' },
      actor,
    );
    expect(res.unitPrice).toBe('1000.1');
  });

  it('create: negatif fiyat BadRequest', async () => {
    await expect(
      service.create({ name: 'X', unitPrice: '-5' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create: çift SKU Conflict', async () => {
    repo.findBySku.mockResolvedValue(productRecord({ sku: 'SKU1' }));
    await expect(
      service.create({ name: 'X', unitPrice: '10', sku: 'SKU1' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('findOne: yok → NotFound', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove: soft delete çağrılır', async () => {
    repo.findById.mockResolvedValue(productRecord());
    repo.softDelete.mockResolvedValue(productRecord({ active: false }));
    const res = await service.remove('p-1', actor);
    expect(res).toEqual({ deleted: true });
    expect(repo.softDelete).toHaveBeenCalledWith('p-1');
  });
});
