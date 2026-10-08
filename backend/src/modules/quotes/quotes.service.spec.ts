// src/modules/quotes/quotes.service.spec.ts
import { ConflictException } from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QuotesService } from './quotes.service';
import { QuotesRepository } from './quotes.repository';
import { ProductsService } from '../products/products.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const D = Prisma.Decimal;

const actor: AuthenticatedUser = {
  id: 'u-1',
  email: 'a@crm.dev',
  roles: ['ADMIN'],
  permissions: [],
};

const quoteRecord = (over: Record<string, unknown> = {}) => ({
  id: 'q-1',
  number: null,
  dealId: null,
  customerName: 'Acme',
  customerEmail: null,
  status: QuoteStatus.DRAFT,
  currency: 'EUR',
  subtotal: new D('2000'),
  taxRate: new D('20'),
  taxAmount: new D('400'),
  total: new D('2400'),
  validUntil: null,
  convertedInvoiceId: null,
  createdById: 'u-1',
  tenantId: null,
  lineItems: [
    {
      id: 'li-1',
      productId: 'p-1',
      description: 'Lisans',
      quantity: new D('2'),
      unitPrice: new D('1000'),
      lineTotal: new D('2000'),
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('QuotesService', () => {
  let repo: { [k in keyof QuotesRepository]: jest.Mock };
  let products: { findOne: jest.Mock };
  let service: QuotesService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      replaceDraft: jest.fn(),
      sendWithNumber: jest.fn(),
      setStatus: jest.fn(),
      delete: jest.fn(),
      convertToInvoice: jest.fn(),
    } as unknown as typeof repo;
    products = { findOne: jest.fn() };
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    service = new QuotesService(
      repo as unknown as QuotesRepository,
      products as unknown as ProductsService,
      events,
    );
  });

  it('create: productId kalemini çözer ve toplamı Decimal hesaplar', async () => {
    products.findOne.mockResolvedValue({
      id: 'p-1',
      name: 'Lisans',
      unitPrice: '1000',
    });
    repo.create.mockResolvedValue(quoteRecord());

    const res = await service.create(
      {
        customerName: 'Acme',
        taxRate: '20',
        lineItems: [{ productId: 'p-1', quantity: '2' }],
      },
      actor,
    );

    expect(products.findOne).toHaveBeenCalledWith('p-1');
    expect(res.subtotal).toBe('2000');
    expect(res.taxAmount).toBe('400');
    expect(res.total).toBe('2400');
    // repo.create kalem fiyatı/açıklaması üründen çözüldü
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ subtotal: expect.anything() }),
      expect.arrayContaining([
        expect.objectContaining({
          productId: 'p-1',
          description: 'Lisans',
          unitPrice: '1000',
        }),
      ]),
    );
  });

  it('convert: zaten CONVERTED → Conflict (çift dönüşüm engeli)', async () => {
    repo.findById.mockResolvedValue(
      quoteRecord({
        status: QuoteStatus.CONVERTED,
        convertedInvoiceId: 'inv-1',
      }),
    );
    await expect(service.convert('q-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.convertToInvoice).not.toHaveBeenCalled();
  });

  it('convert: DRAFT → Conflict (yalnız ACCEPTED/SENT)', async () => {
    repo.findById.mockResolvedValue(quoteRecord({ status: QuoteStatus.DRAFT }));
    await expect(service.convert('q-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('convert: ACCEPTED → fatura oluşturur, invoiceId döner', async () => {
    repo.findById.mockResolvedValue(
      quoteRecord({ status: QuoteStatus.ACCEPTED }),
    );
    repo.convertToInvoice.mockResolvedValue({
      invoice: { id: 'inv-9' },
      quote: quoteRecord({
        status: QuoteStatus.CONVERTED,
        convertedInvoiceId: 'inv-9',
      }),
    });
    const res = await service.convert('q-1', actor);
    expect(res.invoiceId).toBe('inv-9');
    expect(res.quote.status).toBe(QuoteStatus.CONVERTED);
    expect(repo.convertToInvoice).toHaveBeenCalled();
  });

  it('send: DRAFT olmayan → Conflict', async () => {
    repo.findById.mockResolvedValue(quoteRecord({ status: QuoteStatus.SENT }));
    await expect(service.send('q-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('update: DRAFT olmayan → Conflict', async () => {
    repo.findById.mockResolvedValue(
      quoteRecord({ status: QuoteStatus.ACCEPTED }),
    );
    await expect(
      service.update('q-1', { customerName: 'Yeni' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
