// src/modules/invoices/invoices.service.spec.ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoicesService } from './invoices.service';
import { InvoicesRepository } from './invoices.repository';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permission.enum';

const D = Prisma.Decimal;

const finance: AuthenticatedUser = {
  id: 'fin-1',
  email: 'f@crm.dev',
  roles: ['FINANCE'],
  permissions: [
    PERMISSIONS.INVOICE.CREATE,
    PERMISSIONS.INVOICE.READ,
    PERMISSIONS.INVOICE.UPDATE,
    PERMISSIONS.INVOICE.READ_FINANCIAL,
  ],
};
const sales: AuthenticatedUser = {
  id: 'sa-1',
  email: 's@crm.dev',
  roles: ['SALES'],
  permissions: [PERMISSIONS.INVOICE.READ], // finansal YOK
};

const invoiceRecord = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  number: null as string | null,
  dealId: null as string | null,
  customerName: 'ACME',
  customerEmail: null as string | null,
  status: InvoiceStatus.DRAFT,
  currency: 'EUR',
  subtotal: new D('3000'),
  taxRate: new D('20'),
  taxAmount: new D('600'),
  total: new D('3600'),
  amountPaid: new D('0'),
  issuedAt: null as Date | null,
  dueAt: null as Date | null,
  createdById: 'x',
  createdAt: new Date(),
  updatedAt: new Date(),
  lineItems: [] as unknown[],
  payments: [] as unknown[],
  ...over,
});

describe('InvoicesService', () => {
  let service: InvoicesService;
  let repo: { [k in keyof InvoicesRepository]: jest.Mock };

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      replaceDraft: jest.fn(),
      issueWithNumber: jest.fn(),
      addPayment: jest.fn(),
      cancel: jest.fn(),
    } as unknown as typeof repo;
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    service = new InvoicesService(
      repo as unknown as InvoicesRepository,
      events,
    );
  });

  const createDto = {
    customerName: 'ACME',
    taxRate: '20',
    lineItems: [{ description: 'Hizmet', quantity: '2', unitPrice: '1500.00' }],
  };

  // Calcul serveur + visibilité financière
  it('create : FINANCE voit les champs financiers ; le total serveur est appliqué', async () => {
    repo.create.mockResolvedValue(invoiceRecord());
    const res = (await service.create(createDto, finance)) as Record<
      string,
      unknown
    >;
    // repo.create appelé avec les totaux calculés côté serveur
    const arg = repo.create.mock.calls[0][0];
    expect(arg.subtotal.toString()).toBe('3000');
    expect(arg.total.toString()).toBe('3600');
    expect(res.total).toBe('3600');
  });

  // S-4.1 / E-4.2 — finansal maskeleme
  it('create/vue : SALES NE VOIT PAS les champs financiers (masqués)', async () => {
    repo.create.mockResolvedValue(invoiceRecord());
    const res = (await service.create(createDto, sales)) as Record<
      string,
      unknown
    >;
    expect(res.total).toBeUndefined();
    expect(res.amountPaid).toBeUndefined();
    expect(res.lineItems).toBeUndefined();
    expect(res.customerName).toBe('ACME'); // finansal olmayan alan görünür
  });

  // U-4.3 — SENT faturada update → Conflict (immutability)
  it('update: SENT faturada ConflictException', async () => {
    repo.findById.mockResolvedValue(
      invoiceRecord({ status: InvoiceStatus.SENT }),
    );
    await expect(
      service.update('inv-1', { customerName: 'X' }, finance),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // U-4.4 — surpaiement
  it('addPayment : surpaiement → BadRequest', async () => {
    repo.findById.mockResolvedValue(
      invoiceRecord({
        status: InvoiceStatus.SENT,
        amountPaid: new D('0'),
        total: new D('100'),
      }),
    );
    await expect(
      service.addPayment('inv-1', { amount: '200', method: 'BANK' }, finance),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('addPayment : paiement partiel → PARTIALLY_PAID', async () => {
    repo.findById.mockResolvedValue(
      invoiceRecord({
        status: InvoiceStatus.SENT,
        amountPaid: new D('0'),
        total: new D('100'),
      }),
    );
    repo.addPayment.mockResolvedValue(
      invoiceRecord({
        status: InvoiceStatus.PARTIALLY_PAID,
        amountPaid: new D('40'),
        total: new D('100'),
      }),
    );
    await service.addPayment(
      'inv-1',
      { amount: '40', method: 'BANK' },
      finance,
    );
    expect(repo.addPayment).toHaveBeenCalledWith(
      expect.objectContaining({ status: InvoiceStatus.PARTIALLY_PAID }),
    );
  });

  // U-4.5 — PAID fatura iptal edilemez
  it('cancel: PAID faturada ConflictException', async () => {
    repo.findById.mockResolvedValue(
      invoiceRecord({ status: InvoiceStatus.PAID, amountPaid: new D('3600') }),
    );
    await expect(service.cancel('inv-1', finance)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('addPayment: DRAFT faturada ConflictException', async () => {
    repo.findById.mockResolvedValue(
      invoiceRecord({ status: InvoiceStatus.DRAFT }),
    );
    await expect(
      service.addPayment('inv-1', { amount: '10', method: 'CASH' }, finance),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
