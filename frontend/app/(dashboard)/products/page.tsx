'use client';
// app/(dashboard)/products/page.tsx — ürün tam CRUD (i18n).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { DataTable, Column } from '@/components/organisms/DataTable';
import { CrudFormModal, CrudField } from '@/components/organisms/CrudFormModal';
import { Spinner } from '@/components/atoms/Spinner';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';

interface Product {
  id: string;
  sku: string | null;
  name: string;
  description?: string | null;
  unitPrice: string;
  currency: string;
  taxRate: string;
  active: boolean;
}

const FIELDS: CrudField[] = [
  { key: 'name', label: 'field.name', required: true },
  { key: 'sku', label: 'field.sku' },
  { key: 'unitPrice', label: 'field.unitPrice', type: 'number', required: true, placeholder: '1000.00' },
  { key: 'currency', label: 'field.currency', placeholder: 'EUR' },
  { key: 'taxRate', label: 'field.taxRate', type: 'number', placeholder: '20' },
  { key: 'description', label: 'field.description', type: 'textarea' },
];

export default function ProductsPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () =>
      unwrap<Product[]>(
        (await api.get('/products', { params: { limit: 50 } })).data,
      ),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });

  const columns: Column<Product>[] = [
    { key: 'name', header: t('col.product'), render: (r) => r.name },
    { key: 'sku', header: t('col.sku'), render: (r) => r.sku ?? '—' },
    {
      key: 'unitPrice',
      header: t('col.unitPrice'),
      render: (r) => `${r.unitPrice} ${r.currency}`,
    },
    { key: 'taxRate', header: t('col.taxRate'), render: (r) => r.taxRate },
    {
      key: 'active',
      header: t('col.status'),
      render: (r) => (
        <Badge tone={r.active ? 'green' : 'gray'}>
          {r.active ? t('s.active') : t('s.passive')}
        </Badge>
      ),
    },
  ];

  return (
    <DashboardTemplate title="page.products">
      {can('product.create') && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>{t('btn.newProduct')}</Button>
        </div>
      )}

      {products.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={products.data ?? []}
          empty={t('common.empty')}
          onRowClick={can('product.update') ? setEditing : undefined}
        />
      )}

      {creating && (
        <CrudFormModal
          title={t('m.newProduct')}
          fields={FIELDS}
          submitLabel={t('common.create')}
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await api.post('/products', v);
            invalidate();
          }}
        />
      )}

      {editing && (
        <CrudFormModal
          title={t('m.editProduct')}
          fields={FIELDS}
          initial={{
            name: editing.name,
            sku: editing.sku ?? '',
            unitPrice: editing.unitPrice,
            currency: editing.currency,
            taxRate: editing.taxRate,
            description: editing.description ?? '',
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            await api.patch(`/products/${editing.id}`, v);
            invalidate();
          }}
          onDelete={
            can('product.delete')
              ? async () => {
                  await api.delete(`/products/${editing.id}`);
                  invalidate();
                }
              : undefined
          }
        />
      )}
    </DashboardTemplate>
  );
}
