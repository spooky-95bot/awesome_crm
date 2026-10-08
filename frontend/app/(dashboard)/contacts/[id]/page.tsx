'use client';
// app/(dashboard)/contacts/[id]/page.tsx — Fiche cliente: identité, synthèse, historique des achats.
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api, unwrap } from '@/lib/api';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { Spinner } from '@/components/atoms/Spinner';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
}

interface SaleItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Sale {
  id: string;
  title: string;
  contactId: string | null;
  contactName: string | null;
  total: number;
  currency: string;
  items: SaleItem[];
  createdAt: string;
}

const eur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const contact = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => unwrap<Contact>((await api.get(`/contacts/${id}`)).data),
  });

  const sales = useQuery({
    queryKey: ['sales', 'by-contact', id],
    queryFn: async () =>
      unwrap<Sale[]>((await api.get('/sales', { params: { contactId: id } })).data),
  });

  const c = contact.data;
  const list = sales.data ?? [];
  const totalSpent = list.reduce((s, x) => s + Number(x.total || 0), 0);
  const visitCount = list.length;
  const avgBasket = visitCount > 0 ? totalSpent / visitCount : 0;

  // Prestation la plus fréquente
  const counts = new Map<string, number>();
  list.forEach((s) => s.items.forEach((it) => counts.set(it.description, (counts.get(it.description) ?? 0) + Number(it.quantity))));
  const favorite = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  const lastVisit = list[0]?.createdAt;

  return (
    <DashboardTemplate title="Fiche cliente">
      <button
        onClick={() => router.push('/contacts')}
        className="mb-4 text-sm font-medium text-elysence-gold hover:underline"
      >
        ← Retour aux clientes
      </button>

      {contact.isLoading ? (
        <Spinner />
      ) : !c ? (
        <p className="text-gray-500">Cliente introuvable.</p>
      ) : (
        <>
          {/* Identité */}
          <section className="mb-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              {c.firstName} {c.lastName}
            </h2>
            <div className="mt-2 space-y-1">
              {c.phone && (
                <p className="text-sm text-gray-700">
                  <a href={`tel:${c.phone}`} className="text-elysence-gold hover:underline">
                    📞 {c.phone}
                  </a>
                </p>
              )}
              {c.email && (
                <p className="text-sm text-gray-700">
                  <a href={`mailto:${c.email}`} className="text-elysence-gold hover:underline">
                    ✉️ {c.email}
                  </a>
                </p>
              )}
              {c.title && <p className="text-sm text-gray-500">📝 {c.title}</p>}
            </div>
          </section>

          {/* Synthèse */}
          <section className="mb-5">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Activité
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
                <p className="text-xs text-gray-500">Total dépensé</p>
                <p className="mt-1 text-lg font-semibold text-elysence-gold">{eur(totalSpent)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
                <p className="text-xs text-gray-500">Visites</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{visitCount}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
                <p className="text-xs text-gray-500">Panier moyen</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {visitCount > 0 ? eur(avgBasket) : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
                <p className="text-xs text-gray-500">Dernière visite</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {lastVisit
                    ? new Date(lastVisit).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : '—'}
                </p>
              </div>
            </div>
            {favorite && (
              <p className="mt-2 text-sm text-gray-600">
                Prestation la plus fréquente : <strong>{favorite[0]}</strong> ({favorite[1]})
              </p>
            )}
          </section>

          {/* Historique */}
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Historique des achats
            </h3>
            {sales.isLoading ? (
              <Spinner />
            ) : list.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
                <p className="text-gray-500">Aucun achat enregistré</p>
              </div>
            ) : (
              <div className="space-y-3">
                {list.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        {new Date(s.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="font-semibold text-elysence-gold">{eur(s.total)}</span>
                    </div>
                    <ul className="space-y-1">
                      {s.items.map((it) => (
                        <li key={it.id} className="flex justify-between text-sm text-gray-700">
                          <span className="truncate">
                            {it.quantity > 1 ? `${it.quantity}× ` : ''}
                            {it.description}
                          </span>
                          <span className="ml-2 shrink-0">{eur(it.lineTotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </DashboardTemplate>
  );
}
