'use client';
// src/components/organisms/Brand360.tsx — 360° büyüme: sinyal kartları + AI oyun kitabı.
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { StatCard } from '../molecules/StatCard';
import { Spinner } from '../atoms/Spinner';

interface Signals {
  competitors: number;
  savedAds: number;
  products: number;
  avgPrice: number | null;
}
interface Playbook {
  aiUsed: boolean;
  positioning: string;
  pricingInsight: string;
  nextActions: string[];
  adAngles: string[];
  contentIdeas: string[];
}

export function Brand360({ brandId }: { brandId: string }) {
  const { t } = useI18n();

  const signals = useQuery({
    queryKey: ['signals', brandId],
    queryFn: async () =>
      unwrap<Signals>((await api.get(`/brands/${brandId}/signals`)).data),
  });

  const playbook = useMutation({
    mutationFn: async () =>
      unwrap<Playbook>((await api.post(`/brands/${brandId}/playbook`)).data),
  });

  const s = signals.data;
  const p = playbook.data;

  const section = (title: string, items: string[]) =>
    items.length > 0 ? (
      <div className="mb-3">
        <h4 className="mb-1 text-sm font-semibold text-gray-700">{title}</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('g.competitors')} value={s?.competitors ?? '…'} />
        <StatCard label={t('g.savedAds')} value={s?.savedAds ?? '…'} />
        <StatCard label={t('g.products')} value={s?.products ?? '…'} />
        <StatCard
          label={t('g.avgPrice')}
          value={s?.avgPrice != null ? s.avgPrice.toFixed(0) : '—'}
        />
      </div>

      <Card className="p-4">
        <Button onClick={() => playbook.mutate()} disabled={playbook.isPending}>
          {playbook.isPending ? '…' : `✨ ${t('g.generate')}`}
        </Button>

        {playbook.isPending && (
          <div className="mt-3">
            <Spinner />
          </div>
        )}

        {p && (
          <div className="mt-4">
            {!p.aiUsed && (
              <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                {t('g.aiOff')}
              </p>
            )}
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-semibold text-gray-700">
                {t('g.positioning')}
              </h4>
              <p className="text-sm text-gray-600">{p.positioning}</p>
            </div>
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-semibold text-gray-700">
                {t('g.pricing')}
              </h4>
              <p className="text-sm text-gray-600">{p.pricingInsight}</p>
            </div>
            {section(t('g.nextActions'), p.nextActions)}
            {section(t('g.adAngles'), p.adAngles)}
            {section(t('g.contentIdeas'), p.contentIdeas)}
          </div>
        )}
      </Card>
    </div>
  );
}
