'use client';
// app/(dashboard)/lead-forms/page.tsx — Lead intake formları: liste + oluştur/düzenle + embed.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { DataTable, Column } from '@/components/organisms/DataTable';
import { LeadFormModal } from '@/components/organisms/LeadFormModal';
import { Badge } from '@/components/atoms/Badge';
import { Spinner } from '@/components/atoms/Spinner';
import { Button } from '@/components/atoms/Button';
import type { LeadForm } from '@/types';

export default function LeadFormsPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeadForm | null>(null);
  const manage = can('lead_form.manage');

  const forms = useQuery({
    queryKey: ['lead-forms'],
    queryFn: async () =>
      unwrap<LeadForm[]>((await api.get('/lead-forms')).data),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lead-forms'] });

  const columns: Column<LeadForm>[] = [
    { key: 'name', header: t('col.name'), render: (r) => r.name },
    {
      key: 'submitCount',
      header: t('col.submissions'),
      render: (r) => r.submitCount,
    },
    {
      key: 'isActive',
      header: t('col.status'),
      render: (r) => (
        <Badge tone={r.isActive ? 'green' : 'gray'}>
          {r.isActive ? t('s.active') : t('s.passive')}
        </Badge>
      ),
    },
  ];

  return (
    <DashboardTemplate title="page.leadForms">
      <p className="mb-4 text-sm text-gray-600">
        Gérez les formulaires qui créent les nouvelles demandes.
      </p>
      {manage && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>+ Nouveau formulaire</Button>
        </div>
      )}

      {forms.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={forms.data ?? []}
          empty={t('common.empty')}
          onRowClick={manage ? setEditing : undefined}
        />
      )}

      {creating && (
        <LeadFormModal
          form={null}
          onClose={() => setCreating(false)}
          onSaved={invalidate}
        />
      )}
      {editing && (
        <LeadFormModal
          form={editing}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      )}
    </DashboardTemplate>
  );
}
