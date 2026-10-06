'use client';
// app/page.tsx — Tableau de bord simplifié Elysence Partner.
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { Spinner } from '@/components/atoms/Spinner';
import type { UnqualifiedLead } from '@/types';

export default function DashboardHome() {
  const { can } = useAuth();
  const { t } = useI18n();

  const leads = useQuery({
    queryKey: ['leads', 'dashboard'],
    queryFn: async () =>
      unwrap<UnqualifiedLead[]>((await api.get('/leads', { params: { limit: 100 } })).data),
  });

  const allLeads = leads.data ?? [];
  const newLeads = allLeads.filter((l) => l.status === 'NEW');
  const workingLeads = allLeads.filter((l) => l.status === 'WORKING');

  return (
    <DashboardTemplate title="page.dashboard">
      <p className="mb-6 text-sm text-gray-600">
        Visualisez les demandes qui nécessitent votre attention.
      </p>

      {leads.isLoading ? (
        <Spinner />
      ) : (
        <>
          {/* Nouveaux leads — action prioritaire */}
          {can('lead.read') && newLeads.length > 0 && (
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Nouveaux leads ({newLeads.length})
                </h2>
                <Link
                  href="/leads"
                  className="text-sm font-medium text-elysence-gold hover:underline"
                >
                  Voir tout →
                </Link>
              </div>
              <div className="space-y-2">
                {newLeads.slice(0, 3).map((lead) => (
                  <Link
                    key={lead.id}
                    href="/leads"
                    className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-gray-900">
                          {lead.firstName} {lead.lastName}
                        </h3>
                        {lead.phone && (
                          <p className="text-sm text-gray-600">📞 {lead.phone}</p>
                        )}
                        {lead.source && (
                          <p className="truncate text-sm text-gray-500">{lead.source}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Nouveau
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Leads en cours */}
          {can('lead.read') && workingLeads.length > 0 && (
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  En cours ({workingLeads.length})
                </h2>
                <Link
                  href="/leads"
                  className="text-sm font-medium text-elysence-gold hover:underline"
                >
                  Voir tout →
                </Link>
              </div>
              <div className="space-y-2">
                {workingLeads.slice(0, 3).map((lead) => (
                  <Link
                    key={lead.id}
                    href="/leads"
                    className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-gray-900">
                          {lead.firstName} {lead.lastName}
                        </h3>
                        {lead.phone && (
                          <p className="text-sm text-gray-600">📞 {lead.phone}</p>
                        )}
                        {lead.source && (
                          <p className="truncate text-sm text-gray-500">{lead.source}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        En cours
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* État vide */}
          {allLeads.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-gray-500">Aucun lead pour le moment</p>
              <p className="mt-1 text-sm text-gray-400">
                Les nouvelles demandes apparaîtront ici automatiquement.
              </p>
            </div>
          )}

          {/* Accès rapide */}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Accès rapide
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {can('lead.read') && (
                <Link
                  href="/leads"
                  className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="text-2xl">📋</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">Leads</p>
                </Link>
              )}
              {can('lead_form.read') && (
                <Link
                  href="/lead-forms"
                  className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="text-2xl">📝</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">Formulaires</p>
                </Link>
              )}
              {can('user.read') && (
                <Link
                  href="/users"
                  className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md"
                >
                  <p className="text-2xl">👥</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">Utilisateurs</p>
                </Link>
              )}
            </div>
          </section>
        </>
      )}
    </DashboardTemplate>
  );
}
