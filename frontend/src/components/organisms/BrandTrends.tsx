'use client';
// src/components/organisms/BrandTrends.tsx — niş anahtar kelime ilgi-zaman serisi (SerpAPI Google Trends).
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Spinner } from '../atoms/Spinner';
import { BarChart } from '../molecules/Charts';

interface TrendPoint {
  date: string;
  points: Record<string, number>;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function BrandTrends({ brandId }: { brandId: string }) {
  const { t } = useI18n();
  const [geo, setGeo] = useState('TR');
  const [data, setData] = useState<{
    keywords: string[];
    timeline: TrendPoint[];
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchTrends = useMutation({
    mutationFn: async () =>
      unwrap<{ keywords: string[]; timeline: TrendPoint[] }>(
        (await api.post(`/brands/${brandId}/trends`, { geo: geo.toUpperCase() }))
          .data,
      ),
    onSuccess: (r) => {
      setData(r);
      setErr(null);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? t('trend.connectHint');
      setErr(msg);
      setData(null);
    },
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('trend.geo')}
            </label>
            <input
              value={geo}
              onChange={(e) => setGeo(e.target.value.toUpperCase())}
              maxLength={2}
              className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <Button
            onClick={() => fetchTrends.mutate()}
            disabled={fetchTrends.isPending}
          >
            {fetchTrends.isPending ? '…' : `📈 ${t('trend.fetch')}`}
          </Button>
        </div>
        {err && <p className="mt-2 text-sm text-amber-600">{err}</p>}
      </Card>

      {fetchTrends.isPending ? (
        <Spinner />
      ) : data && data.timeline.length > 0 ? (
        <Card className="p-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-700">
            {t('trend.title')}
          </h4>
          <BarChart
            labels={data.timeline.map((p) => p.date)}
            series={data.keywords.map((k, i) => ({
              name: k,
              color: COLORS[i % COLORS.length],
            }))}
            values={data.keywords.map((k) =>
              data.timeline.map((p) => p.points[k] ?? 0),
            )}
            height={200}
          />
        </Card>
      ) : data ? (
        <p className="text-sm text-gray-400">{t('trend.empty')}</p>
      ) : null}
    </div>
  );
}
