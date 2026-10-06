'use client';
// app/(dashboard)/leads/page.tsx — Leads simplifié, mobile-first (cartes).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { CrudFormModal, CrudField } from '@/components/organisms/CrudFormModal';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Spinner } from '@/components/atoms/Spinner';
import type { UnqualifiedLead } from '@/types';

const tone: Record<string, 'gray' | 'blue' | 'green' | 'amber' | 'red'> = {
  NEW: 'blue',
  WORKING: 'amber',
  QUALIFIED: 'green',
  UNQUALIFIED: 'red',
  CONVERTED: 'gray',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nouveau',
  WORKING: 'En cours',
  QUALIFIED: 'Qualifié',
  UNQUALIFIED: 'Non qualifié',
  CONVERTED: 'Converti',
};

const BASE: CrudField[] = [
  { key: 'firstName', label: 'Prénom', required: true },
  { key: 'lastName', label: 'Nom', required: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Téléphone', type: 'phone' },
  { key: 'companyName', label: 'Société' },
  { key: 'source', label: 'Source', placeholder: 'Web / Recommandation / Événement' },
];

const STATUS_FIELD: CrudField = {
  key: 'status',
  label: 'Statut',
  type: 'select',
  options: ['NEW', 'WORKING', 'QUALIFIED', 'UNQUALIFIED'].map((s) => ({
    value: s,
    label: STATUS_LABELS[s] ?? s,
  })),
};

export default function LeadsPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UnqualifiedLead | null>(null);
  const [filter, setFilter] = useState<'all' | 'new' | 'working'>('all');

  const leads = useQuery({
    queryKey: ['leads'],
    queryFn: async () =>
      unwrap<UnqualifiedLead[]>((await api.get('/leads', { params: { limit: 100 } })).data),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['leads'] });

  const allLeads = leads.data ?? [];
  const filtered = allLeads.filter((l) => {
    if (filter === 'new') return l.status === 'NEW';
    if (filter === 'working') return l.status === 'WORKING';
    return true;
  });

  const newCount = allLeads.filter((l) => l.status === 'NEW').length;
  const workingCount = allLeads.filter((l) => l.status === 'WORKING').length;

  return (
    <DashboardTemplate title="page.leads">
      {/* Description */}
      <p className="mb-4 text-sm text-gray-600">
        Consultez et suivez les demandes reçues.
      </p>

      {/* Actions principales */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {can('lead.create') && (
          <Button onClick={() => setCreating(true)}>+ Nouveau lead</Button>
        )}
      </div>

      {/* Filtres rapides */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-elysence-gold text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Tous ({allLeads.length})
        </button>
        <button
          onClick={() => setFilter('new')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === 'new'
              ? 'bg-elysence-gold text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Nouveaux ({newCount})
        </button>
        <button
          onClick={() => setFilter('working')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === 'working'
              ? 'bg-elysence-gold text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          En cours ({workingCount})
        </button>
      </div>

      {/* Liste en cartes (mobile-first) */}
      {leads.isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-500">Aucun lead à afficher</p>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="mt-2 text-sm text-elysence-gold hover:underline"
            >
              Voir tous les leads
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              onClick={() => can('lead.update') && setEditing(lead)}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* En-tête: nom + statut */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-gray-900">
                    {lead.firstName} {lead.lastName}
                  </h3>
                  {lead.companyName && (
                    <p className="truncate text-sm text-gray-500">{lead.companyName}</p>
                  )}
                </div>
                <Badge tone={tone[lead.status] ?? 'gray'}>
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </Badge>
              </div>

              {/* Coordonnées */}
              <div className="mb-3 space-y-1">
                {lead.phone && (
                  <p className="text-sm text-gray-700">
                    <span className="mr-1">📞</span>
                    <a href={`tel:${lead.phone}`} className="text-elysence-gold hover:underline">
                      {lead.phone}
                    </a>
                  </p>
                )}
                {lead.email && (
                  <p className="truncate text-sm text-gray-700">
                    <span className="mr-1">✉️</span>
                    <a href={`mailto:${lead.email}`} className="text-elysence-gold hover:underline">
                      {lead.email}
                    </a>
                  </p>
                )}
              </div>

              {/* Source */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{lead.source ?? '—'}</span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {lead.channel === 'FORM' ? 'Formulaire' : lead.channel === 'MANUAL' ? 'Manuel' : lead.channel}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale création */}
      {creating && (
        <CrudFormModal
          title="Nouveau lead"
          fields={BASE}
          submitLabel="Créer"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await api.post('/leads', v);
            invalidate();
          }}
        />
      )}

      {/* Modale édition */}
      {editing && (
        <CrudFormModal
          title="Modifier le lead"
          fields={[...BASE, STATUS_FIELD]}
          initial={{
            firstName: editing.firstName,
            lastName: editing.lastName,
            email: editing.email ?? '',
            phone: editing.phone ?? '',
            companyName: editing.companyName ?? '',
            source: editing.source ?? '',
            status: editing.status,
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            await api.patch(`/leads/${editing.id}`, v);
            invalidate();
          }}
          onDelete={
            can('lead.delete')
              ? async () => {
                  await api.delete(`/leads/${editing.id}`);
                  invalidate();
                }
              : undefined
          }
        />
      )}
    </DashboardTemplate>
  );
}
