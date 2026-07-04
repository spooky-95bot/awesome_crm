'use client';
// src/components/organisms/BrandCompetitors.tsx — markaya bağlı rakip listesi + ekle + AI içe aktar.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Spinner } from '../atoms/Spinner';
import type { Competitor } from '@/types';

export function BrandCompetitors({ brandId }: { brandId: string }) {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const manage = can('brand.manage');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');

  const list = useQuery({
    queryKey: ['competitors', brandId],
    queryFn: async () =>
      unwrap<Competitor[]>(
        (await api.get(`/brands/${brandId}/competitors`)).data,
      ),
  });
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['competitors', brandId] });

  const add = useMutation({
    mutationFn: async () =>
      api.post(`/brands/${brandId}/competitors`, {
        name: name.trim(),
        domain: domain.trim() || undefined,
      }),
    onSuccess: () => {
      setName('');
      setDomain('');
      invalidate();
    },
  });
  const importAi = useMutation({
    mutationFn: async () =>
      unwrap<{ added: number }>(
        (await api.post(`/brands/${brandId}/competitors/import-suggested`))
          .data,
      ),
    onSuccess: (r) => {
      alert(`${r.added} ${t('comp.imported')}`);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/competitors/${id}`),
    onSuccess: invalidate,
  });

  return (
    <Card className="p-4">
      {manage && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('comp.name')}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t('comp.domain')}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || !name.trim()}
          >
            {t('comp.add')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => importAi.mutate()}
            disabled={importAi.isPending}
          >
            ✨ {t('comp.import')}
          </Button>
        </div>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-sm text-gray-400">{t('comp.empty')}</p>
      ) : (
        <div className="space-y-2">
          {(list.data ?? []).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-gray-100 p-2"
            >
              <span className="font-medium text-gray-800">{c.name}</span>
              <Badge tone={c.source === 'manual' ? 'gray' : 'green'}>
                {c.source === 'manual' ? t('comp.manual') : t('comp.ai')}
              </Badge>
              {c.domain && (
                <a
                  href={
                    c.domain.startsWith('http') ? c.domain : `https://${c.domain}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline"
                >
                  {c.domain}
                </a>
              )}
              <span className="flex-1" />
              {manage && (
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => remove.mutate(c.id)}
                >
                  {t('common.delete')}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
