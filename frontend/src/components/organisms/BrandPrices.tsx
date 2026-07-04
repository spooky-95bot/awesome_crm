'use client';
// src/components/organisms/BrandPrices.tsx — rakip ürün/fiyat: CSV içe aktar + fiyat geçmişi.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Textarea } from '../atoms/Textarea';
import { Spinner } from '../atoms/Spinner';

interface Product {
  id: string;
  name: string;
  url: string | null;
  price: string;
  currency: string;
  prices: { price: string; capturedAt: string }[];
}

export function BrandPrices({ brandId }: { brandId: string }) {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const manage = can('brand.manage');
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ['products', brandId],
    queryFn: async () =>
      unwrap<Product[]>((await api.get(`/brands/${brandId}/products`)).data),
  });

  const imp = useMutation({
    mutationFn: async () =>
      unwrap<{ created: number; updated: number }>(
        (await api.post(`/brands/${brandId}/products/import-csv`, { csv }))
          .data,
      ),
    onSuccess: (r) => {
      setMsg(`${r.created + r.updated} ${t('price.imported')}`);
      setCsv('');
      qc.invalidateQueries({ queryKey: ['products', brandId] });
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', brandId] }),
  });

  // Fiyat geçmişinden yön (son iki nokta).
  const trend = (p: Product) => {
    if (p.prices.length < 2) return '';
    const [latest, prev] = [Number(p.prices[0].price), Number(p.prices[1].price)];
    if (latest < prev) return '↓';
    if (latest > prev) return '↑';
    return '→';
  };

  return (
    <div className="space-y-4">
      {manage && (
        <Card className="p-4">
          <h4 className="mb-1 text-sm font-semibold text-gray-700">
            {t('price.importTitle')}
          </h4>
          <p className="mb-2 text-xs text-gray-400">{t('price.note')}</p>
          <Textarea
            rows={4}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={`${t('price.csvHint')}\nOversize Tişört,299.90,TRY,https://rakip.com/x`}
            className="font-mono text-xs"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={() => imp.mutate()}
              disabled={imp.isPending || csv.trim().length < 3}
            >
              {imp.isPending ? '…' : t('price.import')}
            </Button>
            {msg && <span className="text-sm text-emerald-600">{msg}</span>}
            {imp.isError && (
              <span className="text-sm text-red-600">{t('common.error')}</span>
            )}
          </div>
        </Card>
      )}

      {products.isLoading ? (
        <Spinner />
      ) : (products.data ?? []).length === 0 ? (
        <p className="text-sm text-gray-400">{t('price.empty')}</p>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2">{t('col.product')}</th>
                <th className="px-4 py-2">{t('col.price')}</th>
                <th className="px-4 py-2">{t('price.history')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(products.data ?? []).map((p) => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="px-4 py-2">
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        {p.name}
                      </a>
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {p.price} {p.currency} {trend(p)}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {p.prices.length}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {manage && (
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() => del.mutate(p.id)}
                      >
                        {t('common.delete')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
