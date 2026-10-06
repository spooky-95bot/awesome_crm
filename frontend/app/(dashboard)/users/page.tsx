'use client';
// app/(dashboard)/users/page.tsx — kullanıcı tam CRUD (i18n).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { DataTable, Column } from '@/components/organisms/DataTable';
import { CrudFormModal, CrudField } from '@/components/organisms/CrudFormModal';
import { UserEditModal } from '@/components/organisms/UserEditModal';
import { Badge } from '@/components/atoms/Badge';
import { Spinner } from '@/components/atoms/Spinner';
import { Button } from '@/components/atoms/Button';
import type { User } from '@/types';

const CREATE_FIELDS: CrudField[] = [
  { key: 'email', label: 'field.email', type: 'email', required: true },
  {
    key: 'password',
    label: 'field.password',
    type: 'password',
    required: true,
    placeholder: 'min 10, strong',
  },
  { key: 'firstName', label: 'field.firstName', required: true },
  { key: 'lastName', label: 'field.lastName', required: true },
];

export default function UsersPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: async () =>
      unwrap<User[]>((await api.get('/users', { params: { limit: 50 } })).data),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const columns: Column<User>[] = [
    { key: 'name', header: t('col.name'), render: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'email', header: t('col.email'), render: (r) => r.email },
    {
      key: 'roles',
      header: t('col.roles'),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.roles.map((role) => (
            <Badge key={role} tone="indigo">
              {role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'active',
      header: t('col.status'),
      render: (r) =>
        r.isActive ? (
          <Badge tone="green">{t('s.active')}</Badge>
        ) : (
          <Badge tone="red">{t('s.passive')}</Badge>
        ),
    },
  ];

  return (
    <DashboardTemplate title="page.users">
      <p className="mb-4 text-sm text-gray-600">
        Gérez les personnes autorisées à accéder à Elysence Partner.
      </p>
      {can('user.create') && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>+ Nouvel utilisateur</Button>
        </div>
      )}

      {users.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={users.data ?? []}
          empty={t('common.empty')}
          onRowClick={can('user.update') ? setEditing : undefined}
        />
      )}

      {creating && (
        <CrudFormModal
          title={t('m.newUser')}
          fields={CREATE_FIELDS}
          submitLabel={t('common.create')}
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await api.post('/users', v);
            invalidate();
          }}
        />
      )}

      {editing && (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onChanged={invalidate}
        />
      )}
    </DashboardTemplate>
  );
}
