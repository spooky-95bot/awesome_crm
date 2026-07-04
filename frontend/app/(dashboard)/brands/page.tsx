'use client';
// app/(dashboard)/brands/page.tsx — v4.0 Marka Radarı: marka listesi + onboarding.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { DataTable, Column } from '@/components/organisms/DataTable';
import { BrandWizardModal } from '@/components/organisms/BrandWizardModal';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Spinner } from '@/components/atoms/Spinner';
import type { Brand } from '@/types';

export default function BrandsPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const brands = useQuery({
    queryKey: ['brands'],
    queryFn: async () =>
      unwrap<Brand[]>((await api.get('/brands')).data),
  });

  const columns: Column<Brand>[] = [
    { key: 'name', header: t('brand.name'), render: (r) => r.name },
    { key: 'sector', header: t('col.sector'), render: (r) => r.sector ?? '—' },
    { key: 'niche', header: t('col.niche'), render: (r) => r.niche ?? '—' },
    {
      key: 'ai',
      header: '',
      render: (r) =>
        r.aiEnriched ? <Badge tone="green">AI</Badge> : null,
    },
  ];

  return (
    <DashboardTemplate title="page.brands">
      {can('brand.manage') && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>{t('brand.new')}</Button>
        </div>
      )}

      {brands.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={brands.data ?? []}
          empty={t('common.empty')}
          onRowClick={(r) => router.push(`/brands/${r.id}`)}
        />
      )}

      {creating && (
        <BrandWizardModal
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['brands'] });
            router.push(`/brands/${id}`);
          }}
        />
      )}
    </DashboardTemplate>
  );
}
