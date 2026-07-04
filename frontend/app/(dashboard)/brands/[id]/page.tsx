'use client';
// app/(dashboard)/brands/[id]/page.tsx — v4.0 marka detayı: profil + AI zenginleştirme + sekmeler.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Spinner } from '@/components/atoms/Spinner';
import { BrandCompetitors } from '@/components/organisms/BrandCompetitors';
import { BrandAdRadar } from '@/components/organisms/BrandAdRadar';
import { BrandTrends } from '@/components/organisms/BrandTrends';
import { BrandPrices } from '@/components/organisms/BrandPrices';
import { Brand360 } from '@/components/organisms/Brand360';
import type { Brand } from '@/types';

function Chips({ items, tone = 'gray' }: { items: string[]; tone?: 'gray' | 'blue' | 'green' | 'amber' }) {
  if (!items?.length) return <span className="text-sm text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <Badge key={x} tone={tone}>
          {x}
        </Badge>
      ))}
    </div>
  );
}

export default function BrandDetailPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<
    'g360' | 'profile' | 'competitors' | 'ads' | 'trends' | 'prices'
  >('g360');
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  const brand = useQuery({
    queryKey: ['brand', id],
    queryFn: async () => unwrap<Brand>((await api.get(`/brands/${id}`)).data),
  });

  const enrich = useMutation({
    mutationFn: async () =>
      unwrap<{ aiUsed: boolean }>(
        (await api.post(`/brands/${id}/enrich`)).data,
      ),
    onSuccess: (r) => {
      setEnrichMsg(r.aiUsed ? t('brand.enriched') : t('brand.enrichFallback'));
      qc.invalidateQueries({ queryKey: ['brand', id] });
    },
  });

  const b = brand.data;
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 border-b border-gray-50 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="col-span-2 text-gray-800">{value}</span>
    </div>
  );

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'g360', label: t('brand.tab360') },
    { key: 'profile', label: t('brand.profile') },
    { key: 'competitors', label: t('brand.tabCompetitors') },
    { key: 'ads', label: t('brand.tabAds') },
    { key: 'trends', label: t('brand.tabTrends') },
    { key: 'prices', label: t('brand.tabPrices') },
  ];

  return (
    <DashboardTemplate title={b ? `${t('page.brand')}: ${b.name}` : 'page.brand'}>
      {brand.isLoading || !b ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 flex gap-2 border-b border-gray-200">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === tb.key
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === 'g360' && <Brand360 brandId={id} />}

          {tab === 'profile' && (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  {b.name}{' '}
                  {b.aiEnriched && <Badge tone="green">AI</Badge>}
                </h3>
                {can('brand.manage') && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="text-xs"
                      onClick={() => enrich.mutate()}
                      disabled={enrich.isPending}
                    >
                      {enrich.isPending ? '…' : `✨ ${t('brand.enrich')}`}
                    </Button>
                    {enrichMsg && (
                      <span className="text-xs text-emerald-600">
                        {enrichMsg}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {row(t('brand.sector'), b.sector ?? '—')}
              {row(t('brand.niche'), b.niche ?? '—')}
              {row(t('brand.audience'), b.targetAudience ?? '—')}
              {row(t('brand.priceBand'), b.priceBand ?? '—')}
              {row(t('brand.description'), b.description ?? '—')}
              {row(t('brand.markets'), <Chips items={b.markets} tone="blue" />)}
              {row(t('brand.keywords'), <Chips items={b.keywords} tone="gray" />)}
              {row(
                t('brand.competitors'),
                <Chips items={b.answers?.knownCompetitors ?? []} tone="amber" />,
              )}
              {row(
                t('brand.suggestedCompetitors'),
                <Chips
                  items={b.answers?.suggestedCompetitors ?? []}
                  tone="green"
                />,
              )}
              {row(
                t('brand.adSearchTerms'),
                <Chips items={b.answers?.adSearchTerms ?? []} tone="blue" />,
              )}
            </Card>
          )}

          {tab === 'competitors' && <BrandCompetitors brandId={id} />}
          {tab === 'ads' && <BrandAdRadar brandId={id} />}
          {tab === 'trends' && <BrandTrends brandId={id} />}
          {tab === 'prices' && <BrandPrices brandId={id} />}
        </>
      )}
    </DashboardTemplate>
  );
}
