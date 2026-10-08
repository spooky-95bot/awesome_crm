// src/modules/invoices/invoice-pdf.service.ts
// Génère le PDF d'une facture (pdfkit, pur JS — pas de navigateur headless).
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface InvoicePdfData {
  number: string | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  issuedAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

const GOLD = '#80602d';
const INK = '#17120d';
const MUTED = '#74695d';
const LINE = '#d9cbb9';

function money(n: number, currency: string): string {
  const sym = currency === 'EUR' ? '€' : currency;
  const v = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
  return `${v} ${sym}`;
}

function frDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const STATUS_FR: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  PARTIALLY_PAID: 'Partiellement payée',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulée',
};

@Injectable()
export class InvoicePdfService {
  build(data: InvoicePdfData): PDFKit.PDFDocument {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    // En-tête
    doc
      .fillColor(GOLD)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Maison ELYSENCE', 50, 50);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text('Elysence Partner — Yvelines · Île-de-France', 50, 78);

    doc
      .fillColor(INK)
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('FACTURE', 400, 50, { width: 145, align: 'right' });
    doc
      .fillColor(MUTED)
      .fontSize(10)
      .font('Helvetica')
      .text(`N° ${data.number ?? '—'}`, 400, 76, { width: 145, align: 'right' });
    doc.text(`Date : ${frDate(data.issuedAt ?? data.createdAt)}`, 400, 90, {
      width: 145,
      align: 'right',
    });
    if (data.dueAt) {
      doc.text(`Échéance : ${frDate(data.dueAt)}`, 400, 104, {
        width: 145,
        align: 'right',
      });
    }
    doc.text(`Statut : ${STATUS_FR[data.status] ?? data.status}`, 400, data.dueAt ? 118 : 104, {
      width: 145,
      align: 'right',
    });

    doc.moveTo(50, 135).lineTo(545, 135).strokeColor(LINE).stroke();

    // Client
    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('CLIENTE', 50, 150);
    doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text(data.customerName, 50, 165);
    if (data.customerEmail) {
      doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(data.customerEmail, 50, 182);
    }

    // Tableau des lignes
    let y = 220;
    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold');
    doc.text('PRESTATION', 50, y, { width: 280 });
    doc.text('QTÉ', 330, y, { width: 40, align: 'right' });
    doc.text('PRIX UNIT.', 375, y, { width: 80, align: 'right' });
    doc.text('TOTAL', 460, y, { width: 85, align: 'right' });
    y += 16;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
    y += 8;

    doc.font('Helvetica').fillColor(INK).fontSize(10);
    for (const it of data.lineItems) {
      doc.text(it.description, 50, y, { width: 280 });
      doc.text(String(it.quantity), 330, y, { width: 40, align: 'right' });
      doc.text(money(it.unitPrice, data.currency), 375, y, { width: 80, align: 'right' });
      doc.text(money(it.lineTotal, data.currency), 460, y, { width: 85, align: 'right' });
      y += 20;
      doc.moveTo(50, y - 6).lineTo(545, y - 6).strokeColor('#f0e8dc').stroke();
    }

    // Totaux
    y += 12;
    const tx = 375;
    const tw = 170;
    doc.font('Helvetica').fillColor(MUTED).fontSize(10);
    doc.text('Sous-total', tx, y, { width: 80 });
    doc.fillColor(INK).text(money(data.subtotal, data.currency), tx + 80, y, {
      width: 90,
      align: 'right',
    });
    y += 18;
    doc.fillColor(MUTED).text(`TVA (${data.taxRate} %)`, tx, y, { width: 80 });
    doc.fillColor(INK).text(money(data.taxAmount, data.currency), tx + 80, y, {
      width: 90,
      align: 'right',
    });
    y += 22;
    doc.moveTo(tx, y - 4).lineTo(545, y - 4).strokeColor(LINE).stroke();
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(13);
    doc.text('Total', tx, y, { width: 80 });
    doc.text(money(data.total, data.currency), tx + 80, y, { width: 90, align: 'right' });

    if (data.amountPaid > 0) {
      y += 20;
      doc.fillColor(MUTED).font('Helvetica').fontSize(10);
      doc.text('Déjà payé', tx, y, { width: 80 });
      doc.fillColor(INK).text(money(data.amountPaid, data.currency), tx + 80, y, {
        width: 90,
        align: 'right',
      });
      y += 18;
      doc.fillColor(MUTED).text('Reste à payer', tx, y, { width: 80 });
      doc.fillColor(INK).text(money(data.total - data.amountPaid, data.currency), tx + 80, y, {
        width: 90,
        align: 'right',
      });
    }

    // Pied de page
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Maison ELYSENCE — Facture préparée avec Elysence Partner. Document non fiscal tant que les mentions légales ne sont pas complétées.',
        50,
        780,
        { width: 495, align: 'center' },
      );

    return doc;
  }
}
