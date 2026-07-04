'use client';
// src/components/organisms/BrandAdRadar.tsx — nişe göre Meta reklam radarı (resmi Ad Library API).
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Spinner } from '../atoms/Spinner';

interface Ad {
  adArchiveId: string;
  pageName: string | null;
  body: string | null;
  snapshotUrl: string | null;
  startTime: string | null;
  platforms: string[];
}
interface SavedAd {
  id: string;
  pageName: string | null;
  body: string | null;
  snapshotUrl: string | null;
}

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function BrandAdRadar({ brandId }: { brandId: string }) {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const manage = can('brand.manage');
  const [country, setCountry] = useState('TR');
  const [terms, setTerms] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [results, setResults] = useState<Ad[] | null>(null);
  const [usedTerms, setUsedTerms] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const saved = useQuery({
    queryKey: ['saved-ads', brandId],
    queryFn: async () =>
      unwrap<SavedAd[]>(
        (await api.get(`/brands/${brandId}/ad-radar/saved`)).data,
      ),
  });

  const search = useMutation({
    mutationFn: async () =>
      unwrap<{ ads: Ad[]; terms: string[] }>(
        (
          await api.post(`/brands/${brandId}/ad-radar/search`, {
            country: country.toUpperCase(),
            searchTerms: terms ? list(terms) : undefined,
            activeStatus: activeOnly ? 'ACTIVE' : 'ALL',
          })
        ).data,
      ),
    onSuccess: (r) => {
      setResults(r.ads);
      setUsedTerms(r.terms);
      setErr(null);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? t('ar.connectHint');
      setErr(msg);
      setResults(null);
    },
  });

  const save = useMutation({
    mutationFn: async (ad: Ad) =>
      api.post(`/brands/${brandId}/ad-radar/save`, {
        adArchiveId: ad.adArchiveId,
        pageName: ad.pageName ?? undefined,
        body: ad.body ?? undefined,
        snapshotUrl: ad.snapshotUrl ?? undefined,
        startTime: ad.startTime ?? undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-ads', brandId] }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/ad-radar/saved/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-ads', brandId] }),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('ar.country')}
            </label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={2}
              className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="min-w-[16rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('ar.terms')}
            </label>
            <input
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="streetwear, oversize tee"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-1 pb-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            {t('ar.active')}
          </label>
          <Button onClick={() => search.mutate()} disabled={search.isPending}>
            {search.isPending ? '…' : `🔍 ${t('ar.search')}`}
          </Button>
        </div>
        <p className="text-[11px] text-gray-400">{t('ar.scopeNote')}</p>
        {err && <p className="mt-2 text-sm text-amber-600">{err}</p>}
        {results && (
          <p className="mt-2 text-xs text-gray-500">
            {t('ar.usedTerms')}: {usedTerms.join(', ')}
          </p>
        )}
      </Card>

      {search.isPending ? (
        <Spinner />
      ) : results && results.length === 0 ? (
        <p className="text-sm text-gray-400">{t('ar.noResults')}</p>
      ) : results ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {results.map((ad) => (
            <Card key={ad.adArchiveId} className="flex flex-col p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-semibold text-gray-800">
                  {ad.pageName ?? '—'}
                </span>
                {ad.platforms?.map((p) => (
                  <Badge key={p} tone="blue">
                    {p}
                  </Badge>
                ))}
              </div>
              <p className="flex-1 whitespace-pre-wrap text-sm text-gray-600">
                {ad.body ?? '—'}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                {ad.startTime && (
                  <span className="text-gray-400">📅 {ad.startTime}</span>
                )}
                <span className="flex-1" />
                {ad.snapshotUrl && (
                  <a
                    href={ad.snapshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    {t('ar.viewOnMeta')} ↗
                  </a>
                )}
                {manage && (
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    onClick={() => save.mutate(ad)}
                  >
                    ★ {t('ar.save')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {(saved.data ?? []).length > 0 && (
        <Card className="p-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-700">
            {t('ar.savedTitle')}
          </h4>
          <div className="space-y-2">
            {(saved.data ?? []).map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-800">
                  {s.pageName ?? '—'}
                </span>
                <span className="flex-1 truncate text-gray-500">{s.body}</span>
                {s.snapshotUrl && (
                  <Link
                    href={s.snapshotUrl}
                    target="_blank"
                    className="text-xs text-brand-600 hover:underline"
                  >
                    ↗
                  </Link>
                )}
                {manage && (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => del.mutate(s.id)}
                  >
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
