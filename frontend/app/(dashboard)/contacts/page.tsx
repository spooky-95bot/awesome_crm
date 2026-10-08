'use client';
// app/(dashboard)/contacts/page.tsx — Clientes: liste en cartes + accès fiche historique.
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { CrudFormModal, CrudField } from '@/components/organisms/CrudFormModal';
import { Spinner } from '@/components/atoms/Spinner';
import { Button } from '@/components/atoms/Button';
import type { Company, Contact } from '@/types';

export default function ContactsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const contacts = useQuery({
    queryKey: ['contacts'],
    queryFn: async () =>
      unwrap<Contact[]>((await api.get('/contacts', { params: { limit: 200 } })).data),
  });

  const companies = useQuery({
    queryKey: ['companies-options'],
    enabled: can('company.read'),
    queryFn: async () =>
      unwrap<Company[]>((await api.get('/companies', { params: { limit: 100 } })).data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['contacts'] });

  const fields: CrudField[] = [
    { key: 'firstName', label: 'Prénom', required: true },
    { key: 'lastName', label: 'Nom', required: true },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Téléphone', type: 'phone' },
    { key: 'title', label: 'Note' },
    {
      key: 'companyId',
      label: 'Société',
      type: 'select',
      options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    },
  ];

  const list = contacts.data ?? [];

  return (
    <DashboardTemplate title="Clientes">
      <p className="mb-4 text-sm text-gray-600">
        Retrouvez vos clientes et tout ce qu&apos;elles ont acheté.
      </p>

      {can('contact.create') && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>+ Nouvelle cliente</Button>
        </div>
      )}

      {contacts.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-500">Aucune cliente enregistrée</p>
          <p className="mt-1 text-sm text-gray-400">
            Ajoutez une cliente ou convertissez une demande.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-gray-900">
                    {c.firstName} {c.lastName}
                  </h3>
                  {c.phone && (
                    <p className="text-sm text-gray-700">
                      <a href={`tel:${c.phone}`} className="text-elysence-gold hover:underline">
                        📞 {c.phone}
                      </a>
                    </p>
                  )}
                  {c.email && <p className="truncate text-sm text-gray-500">✉️ {c.email}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Link
                    href={`/contacts/${c.id}`}
                    className="rounded-md border border-elysence-gold/40 px-3 py-1.5 text-xs font-medium text-elysence-gold hover:bg-elysence-gold/5"
                  >
                    Historique
                  </Link>
                  <Link
                    href={`/invoices?contactId=${c.id}`}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-center text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Facture
                  </Link>
                  {can('contact.update') && (
                    <button
                      onClick={() => setEditing(c)}
                      className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                    >
                      Modifier
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CrudFormModal
          title="Nouvelle cliente"
          fields={fields}
          submitLabel="Créer"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await api.post('/contacts', v);
            invalidate();
          }}
        />
      )}

      {editing && (
        <CrudFormModal
          title="Modifier la cliente"
          fields={fields}
          initial={{
            firstName: editing.firstName,
            lastName: editing.lastName,
            email: editing.email ?? '',
            phone: editing.phone ?? '',
            title: editing.title ?? '',
            companyId: editing.companyId ?? '',
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            await api.patch(`/contacts/${editing.id}`, v);
            invalidate();
          }}
          onDelete={
            can('contact.delete')
              ? async () => {
                  await api.delete(`/contacts/${editing.id}`);
                  invalidate();
                }
              : undefined
          }
        />
      )}
    </DashboardTemplate>
  );
}
