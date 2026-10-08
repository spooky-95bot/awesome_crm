'use client';
// app/(dashboard)/sales/page.tsx — Ventes: liste, création (cliente + prestations), total.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { Spinner } from '@/components/atoms/Spinner';
import { Button } from '@/components/atoms/Button';

interface SaleItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productId: string | null;
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

interface Product {
  id: string;
  name: string;
  unitPrice: string | number;
  active: boolean;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
}

const eur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

export default function SalesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [contactId, setContactId] = useState('');
  const [lines, setLines] = useState<{ productId: string; qty: number; price: number }[]>([
    { productId: '', qty: 1, price: 0 },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sales = useQuery({
    queryKey: ['sales'],
    queryFn: async () => unwrap<Sale[]>((await api.get('/sales')).data),
  });

  const products = useQuery({
    queryKey: ['products', 'for-sales'],
    queryFn: async () =>
      unwrap<{ data: Product[] }>((await api.get('/products', { params: { limit: 100 } })).data),
    enabled: creating,
  });

  const contacts = useQuery({
    queryKey: ['contacts', 'for-sales'],
    queryFn: async () =>
      unwrap<{ data: Contact[] }>((await api.get('/contacts', { params: { limit: 100 } })).data),
    enabled: creating,
  });

  const productList = products.data?.data ?? [];
  const contactList = contacts.data?.data ?? [];

  const setLine = (i: number, patch: Partial<{ productId: string; qty: number; price: number }>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onPickProduct = (i: number, pid: string) => {
    const p = productList.find((x) => x.id === pid);
    setLine(i, { productId: pid, price: p ? Number(p.unitPrice) : lines[i].price });
  };

  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const items = lines
        .filter((l) => l.qty > 0 && l.price >= 0 && (l.productId || l.price > 0))
        .map((l) => {
          const p = productList.find((x) => x.id === l.productId);
          return {
            productId: l.productId || undefined,
            description: p?.name ?? 'Prestation',
            quantity: l.qty,
            unitPrice: l.price,
          };
        });
      if (items.length === 0) {
        setErr('Ajoutez au moins une prestation.');
        setBusy(false);
        return;
      }
      const c = contactList.find((x) => x.id === contactId);
      await api.post('/sales', {
        contactId: contactId || undefined,
        customerName: c ? `${c.firstName} ${c.lastName}` : undefined,
        items,
      });
      qc.invalidateQueries({ queryKey: ['sales'] });
      setCreating(false);
      setLines([{ productId: '', qty: 1, price: 0 }]);
      setContactId('');
    } catch {
      setErr('Enregistrement impossible. Vérifiez les champs.');
    } finally {
      setBusy(false);
    }
  };

  const list = sales.data ?? [];

  return (
    <DashboardTemplate title="Ventes">
      <p className="mb-4 text-sm text-gray-600">
        Enregistrez ce que vous vendez et suivez votre chiffre d&apos;affaires.
      </p>

      {can('deal.create') && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}>+ Nouvelle vente</Button>
        </div>
      )}

      {sales.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-500">Aucune vente enregistrée</p>
          <p className="mt-1 text-sm text-gray-400">
            Vos ventes apparaîtront ici avec le total et les prestations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-gray-900">
                    {s.contactName ?? s.title}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {new Date(s.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-lg font-semibold text-elysence-gold">
                  {eur(s.total)}
                </span>
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

      {/* Modale création */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Nouvelle vente</h2>

            <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Sélectionner (optionnel) —</option>
              {contactList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>

            <p className="mb-2 text-sm font-medium text-gray-700">Prestations</p>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <select
                    value={l.productId}
                    onChange={(e) => onPickProduct(i, e.target.value)}
                    className="col-span-6 rounded-md border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="">— Prestation —</option>
                    {productList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
                    className="col-span-2 rounded-md border border-gray-300 px-2 py-2 text-sm"
                    aria-label="Quantité"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.price}
                    onChange={(e) => setLine(i, { price: Number(e.target.value) })}
                    className="col-span-3 rounded-md border border-gray-300 px-2 py-2 text-sm"
                    aria-label="Prix"
                  />
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                    className="col-span-1 text-red-600"
                    aria-label="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLines([...lines, { productId: '', qty: 1, price: 0 }])}
              className="mt-2 text-sm font-medium text-elysence-gold"
            >
              + Ajouter une prestation
            </button>

            <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="text-sm text-gray-600">Total</span>
              <span className="text-xl font-semibold text-elysence-gold">{eur(total)}</span>
            </div>

            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

            <div className="mt-4 flex gap-2">
              <Button disabled={busy} onClick={save}>
                {busy ? 'Enregistrement…' : 'Enregistrer la vente'}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardTemplate>
  );
}
