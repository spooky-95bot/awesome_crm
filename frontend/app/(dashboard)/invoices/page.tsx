'use client';
// app/(dashboard)/invoices/page.tsx — fatura: liste + oluştur (kalemli) + issue/ödeme/iptal.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { DataTable, Column } from '@/components/organisms/DataTable';
import { CrudFormModal, CrudField } from '@/components/organisms/CrudFormModal';
import { WhatsAppSendModal } from '@/components/organisms/WhatsAppSendModal';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { FormField } from '@/components/molecules/FormField';
import { Badge } from '@/components/atoms/Badge';
import { Spinner } from '@/components/atoms/Spinner';
import type { Invoice } from '@/types';

const statusTone: Record<string, 'gray' | 'green' | 'amber' | 'red' | 'blue'> = {
  DRAFT: 'gray',
  SENT: 'blue',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
  OVERDUE: 'red',
  CANCELLED: 'red',
};

interface Line {
  description: string;
  quantity: string;
  unitPrice: string;
}

const PAYMENT_FIELDS: CrudField[] = [
  { key: 'amount', label: 'field.amount', type: 'number', required: true },
  {
    key: 'method',
    label: 'field.method',
    type: 'select',
    required: true,
    options: ['BANK', 'CARD', 'CASH'].map((m) => ({ value: m, label: m })),
  },
  { key: 'reference', label: 'field.reference' },
];

export default function InvoicesPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const financial = can('invoice.read_financial');
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [waInvoice, setWaInvoice] = useState<Invoice | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [taxRate, setTaxRate] = useState('20');
  const [lines, setLines] = useState<Line[]>([
    { description: '', quantity: '1', unitPrice: '' },
  ]);

  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: async () =>
      unwrap<Invoice[]>(
        (await api.get('/invoices', { params: { limit: 50 } })).data,
      ),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['invoices'] });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/invoices', {
        customerName,
        taxRate,
        lineItems: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    onSuccess: () => {
      setCreating(false);
      setCustomerName('');
      setLines([{ description: '', quantity: '1', unitPrice: '' }]);
      invalidate();
    },
  });

  const action = useMutation({
    mutationFn: async (p: { id: string; verb: string }) =>
      api.post(`/invoices/${p.id}/${p.verb}`),
    onSuccess: invalidate,
  });

  // v4.6 — iyzico Checkout Form: başlat → hosted ödeme sayfasına yönlen.
  // iyzico ödeme sonrası backend callback'i tarayıcıyı /invoices?payment=... adresine döndürür.
  const payIyzico = useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ paymentPageUrl: string | null }>(
        (await api.post(`/invoices/${id}/pay/iyzico`)).data,
      ),
    onSuccess: (r) => {
      if (r.paymentPageUrl) window.location.href = r.paymentPageUrl;
    },
    onError: () => alert(t('pay.notConnected')),
  });

  // Ödeme dönüşü (?payment=success|failed) → banner + liste tazele. window üzerinden
  // okunur (useSearchParams statik prerender'ı bozardı); yalnız istemcide çalışır.
  const [payResult, setPayResult] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('payment');
    if (p) {
      setPayResult(p);
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v3.2 — bağlı muhasebe sağlayıcısına gönder (QuickBooks/Xero).
  const accSync = useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ status: string; externalId?: string | null; error?: string }>(
        (await api.post(`/accounting/invoices/${id}/sync`)).data,
      ),
    onSuccess: (r) =>
      alert(
        r.status === 'SYNCED'
          ? `${t('acc.synced')} · ${r.externalId ?? ''}`
          : `${t('acc.syncFailed')}: ${r.error ?? ''}`,
      ),
    onError: () => alert(t('acc.notConnected')),
  });

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const columns: Column<Invoice>[] = [
    { key: 'number', header: t('col.number'), render: (r) => r.number ?? '—' },
    { key: 'customer', header: t('col.customer'), render: (r) => r.customerName },
    {
      key: 'status',
      header: t('col.status'),
      render: (r) => (
        <Badge tone={statusTone[r.status] ?? 'gray'}>{r.status}</Badge>
      ),
    },
    {
      key: 'total',
      header: t('col.amount'),
      render: (r) =>
        financial ? (
          <span className="font-medium">
            {r.total} {r.currency}
          </span>
        ) : (
          <span className="text-gray-400">{t('col.hidden')}</span>
        ),
    },
    {
      key: 'actions',
      header: t('col.action'),
      render: (r) => (
        <div className="flex flex-wrap gap-2">
          {r.status === 'DRAFT' && can('invoice.update') && (
            <Button
              variant="secondary"
              className="px-2 py-1 text-xs"
              onClick={() => action.mutate({ id: r.id, verb: 'issue' })}
            >
              {t('act.issue')}
            </Button>
          )}
          {['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(r.status) &&
            can('invoice.update') && (
              <Button
                className="px-2 py-1 text-xs"
                onClick={() => setPaying(r)}
              >
                {t('act.payment')}
              </Button>
            )}
          {['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(r.status) &&
            can('invoice.update') &&
            financial && (
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                onClick={() => payIyzico.mutate(r.id)}
                disabled={payIyzico.isPending}
              >
                💳 {payIyzico.isPending ? t('pay.starting') : t('pay.iyzico')}
              </Button>
            )}
          {can('whatsapp.send') && r.status !== 'DRAFT' && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => setWaInvoice(r)}
            >
              💬 {t('wa.sendVia')}
            </Button>
          )}
          {can('invoice.update') &&
            !['DRAFT', 'CANCELLED'].includes(r.status) && (
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => accSync.mutate(r.id)}
                disabled={accSync.isPending}
              >
                🧮 {t('acc.sync')}
              </Button>
            )}
          {['DRAFT', 'SENT'].includes(r.status) && can('invoice.update') && (
            <Button
              variant="danger"
              className="px-2 py-1 text-xs"
              onClick={() => {
                if (confirm(t('inv.confirmCancel')))
                  action.mutate({ id: r.id, verb: 'cancel' });
              }}
            >
              {t('act.cancel')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardTemplate title="page.invoices">
      {payResult === 'success' && (
        <p className="mb-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
          {t('pay.success')}
        </p>
      )}
      {payResult === 'failed' && (
        <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
          {t('pay.failed')}
        </p>
      )}
      {!financial && (
        <p className="mb-3 text-xs text-amber-600">{t('inv.financialWarn')}</p>
      )}

      {can('invoice.create') && !creating && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>{t('btn.newInvoice')}</Button>
        </div>
      )}

      {creating && (
        <Card className="mb-4 p-4">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              id="inv-cust"
              label={`${t('q.customerName')} *`}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <FormField
              id="inv-tax"
              label={t('q.taxRate')}
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
          <p className="mb-1 text-sm font-medium text-gray-600">{t('q.items')}</p>
          {lines.map((l, i) => (
            <div key={i} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-12">
              <input
                className="rounded-md border border-gray-300 px-2 py-2 text-sm sm:col-span-6"
                placeholder={t('q.description')}
                value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
              />
              <input
                className="rounded-md border border-gray-300 px-2 py-2 text-sm sm:col-span-3"
                placeholder={t('q.quantity')}
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
              />
              <input
                className="rounded-md border border-gray-300 px-2 py-2 text-sm sm:col-span-3"
                placeholder={t('q.unitPrice')}
                value={l.unitPrice}
                onChange={(e) => setLine(i, { unitPrice: e.target.value })}
              />
            </div>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() =>
                setLines([
                  ...lines,
                  { description: '', quantity: '1', unitPrice: '' },
                ])
              }
            >
              {t('btn.addItem')}
            </Button>
            <Button
              disabled={create.isPending || !customerName.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? '…' : t('common.create')}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            {create.isError && (
              <span className="text-sm text-red-600">{t('common.error')}</span>
            )}
          </div>
        </Card>
      )}

      {invoices.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={invoices.data ?? []}
          empty={t('common.empty')}
        />
      )}

      {paying && (
        <CrudFormModal
          title={`${t('inv.paymentTitle')} — ${paying.number ?? paying.customerName}`}
          fields={PAYMENT_FIELDS}
          submitLabel={t('inv.savePayment')}
          onClose={() => setPaying(null)}
          onSubmit={async (v) => {
            await api.post(`/invoices/${paying.id}/payments`, v);
            invalidate();
          }}
        />
      )}

      {waInvoice && (
        <WhatsAppSendModal
          initialBody={t('wa.invoiceMsg')
            .replace('{name}', waInvoice.customerName)
            .replace('{number}', waInvoice.number ?? '—')
            .replace('{total}', (financial && waInvoice.total) || '…')
            .replace('{currency}', waInvoice.currency)}
          onClose={() => setWaInvoice(null)}
        />
      )}
    </DashboardTemplate>
  );
}
