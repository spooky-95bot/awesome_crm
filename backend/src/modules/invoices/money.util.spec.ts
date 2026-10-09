// src/modules/invoices/money.util.spec.ts
import { InvoiceStatus, Prisma } from '@prisma/client';
import { calcTotals, calcTotalsFromGross, deriveStatus, invoiceNumber } from './money.util';

const D = Prisma.Decimal;

describe('calcTotals', () => {
  // U-4.1
  it('calcule correctement sous-total/TVA/total', () => {
    const t = calcTotals([{ quantity: '2', unitPrice: '1500.00' }], '20');
    expect(t.subtotal.toString()).toBe('3000');
    expect(t.taxAmount.toString()).toBe('600');
    expect(t.total.toString()).toBe('3600');
  });

  it('additionne le sous-total de plusieurs lignes', () => {
    const t = calcTotals(
      [
        { quantity: '3', unitPrice: '100.00' },
        { quantity: '1', unitPrice: '50.50' },
      ],
      '10',
    );
    expect(t.subtotal.toString()).toBe('350.5');
    expect(t.taxAmount.toString()).toBe('35.05');
    expect(t.total.toString()).toBe('385.55');
  });

  // U-4.7 — Précision Decimal (pas d'erreur float 0.1+0.2)
  it('précision de 0.1 + 0.2 conservée', () => {
    const t = calcTotals(
      [
        { quantity: '1', unitPrice: '0.10' },
        { quantity: '1', unitPrice: '0.20' },
      ],
      '0',
    );
    expect(t.subtotal.toString()).toBe('0.3'); // et non 0.30000000000000004
    expect(t.total.toString()).toBe('0.3');
  });
});

// --- Variante TTC (prix affichés Elysence : la TVA est incluse) ---
describe('calcTotalsFromGross (prix TTC)', () => {
  it('le total est la somme des lignes, sans ajouter la TVA', () => {
    const t = calcTotalsFromGross([{ quantity: '1', unitPrice: '69.00' }], '20');
    expect(t.total.toString()).toBe('69'); // et non 82,80
    expect(t.subtotal.toString()).toBe('57.5'); // 69 / 1,20
    expect(t.taxAmount.toString()).toBe('11.5'); // 69 − 57,50
  });

  it('plusieurs lignes TTC : total = somme, TVA extraite', () => {
    const t = calcTotalsFromGross(
      [
        { quantity: '1', unitPrice: '80.00' },
        { quantity: '1', unitPrice: '60.00' },
      ],
      '20',
    );
    expect(t.total.toString()).toBe('140');
    expect(t.subtotal.toString()).toBe('116.67');
    expect(t.taxAmount.toString()).toBe('23.33');
  });

  it('taux 0 : total = base, aucune TVA', () => {
    const t = calcTotalsFromGross([{ quantity: '1', unitPrice: '50.00' }], '0');
    expect(t.total.toString()).toBe('50');
    expect(t.taxAmount.toString()).toBe('0');
  });

  it('total TTC = sous-total HT + TVA (cohérence)', () => {
    const t = calcTotalsFromGross([{ quantity: '1', unitPrice: '89.00' }], '20');
    const recomposed = t.subtotal.plus(t.taxAmount);
    expect(recomposed.toString()).toBe(t.total.toString());
  });
});

describe('deriveStatus', () => {
  // U-4.2
  it('paiement complet → PAID', () => {
    expect(deriveStatus(new D('100'), new D('100'))).toBe(InvoiceStatus.PAID);
  });
  it('paiement partiel → PARTIALLY_PAID', () => {
    expect(deriveStatus(new D('40'), new D('100'))).toBe(
      InvoiceStatus.PARTIALLY_PAID,
    );
  });
  it('aucun paiement → SENT', () => {
    expect(deriveStatus(new D('0'), new D('100'))).toBe(InvoiceStatus.SENT);
  });
});

describe('invoiceNumber', () => {
  // U-4.6 — formaté, sans saut
  it('format INV-YYYY-000NNN', () => {
    expect(invoiceNumber(2026, 123)).toBe('INV-2026-000123');
    expect(invoiceNumber(2026, 1)).toBe('INV-2026-000001');
  });
});
