'use client';
// src/components/organisms/BrandTrends.tsx — niş anahtar kelime ilgi-zaman serisi (SerpAPI Google Trends).
// Filtreler: tarih aralığı (son 3/6/12 ay / tümü) + seri (anahtar kelime aç/kapa). Değerler
// Google Trends'in 0–100 göreli ilgi endeksidir (arama sayısı değil) — panelde açıklanır.
import { useMemo, useState } from 'react';
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
// Haftalık noktalar varsayımıyla aralık → nokta sayısı.
const RANGES: { key: string; label: string; points: number | null }[] = [
  { key: '3m', label: '3M', points: 13 },
  { key: '6m', label: '6M', points: 26 },
  { key: '12m', label: '12M', points: 52 },
  { key: 'all', label: '', points: null },
];

export function BrandTrends({ brandId }: { brandId: string }) {
  const { t } = useI18n();
  const [geo, setGeo] = useState('FR');
  const [range, setRange] = useState('all');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
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
      setHidden(new Set());
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? t('trend.connectHint');
      setErr(msg);
      setData(null);
    },
  });

  const colorOf = (k: string) =>
    COLORS[(data?.keywords.indexOf(k) ?? 0) % COLORS.length];

  // Tarih aralığına göre zaman çizelgesini kırp (son N nokta).
  const timeline = useMemo(() => {
    if (!data) return [];
    const n = RANGES.find((r) => r.key === range)?.points;
    return n ? data.timeline.slice(-n) : data.timeline;
  }, [data, range]);

  const visible = (data?.keywords ?? []).filter((k) => !hidden.has(k));

  // Seri başına ort./zirve (görünen aralık üzerinden).
  const stats = useMemo(() => {
    const m: Record<string, { avg: number; peak: number }> = {};
    for (const k of data?.keywords ?? []) {
      const vals = timeline.map((p) => p.points[k] ?? 0);
      const peak = vals.length ? Math.max(...vals) : 0;
      const avg = vals.length
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : 0;
      m[k] = { avg, peak };
    }
    return m;
  }, [data, timeline]);

  const toggle = (k: string) =>
    setHidden((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-700">
              {t('trend.title')}
              <span className="ml-2 font-normal text-gray-400">
                · {geo.toUpperCase()} · 0–100
              </span>
            </h4>
            {/* Tarih aralığı filtresi */}
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-gray-500">
                {t('trend.range')}:
              </span>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={`rounded-md px-2 py-1 text-xs ${
                    range === r.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {r.key === 'all' ? t('trend.rangeAll') : r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Seri (tür) filtresi — tıkla aç/kapa, ort./zirve ile */}
          <div className="mb-3 flex flex-wrap gap-2">
            {data.keywords.map((k) => {
              const off = hidden.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggle(k)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                    off
                      ? 'border-gray-200 bg-gray-50 text-gray-400'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                  title={off ? t('trend.showSeries') : t('trend.hideSeries')}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{
                      backgroundColor: off ? '#d1d5db' : colorOf(k),
                    }}
                  />
                  {k}
                  <span className="text-gray-400">
                    · {t('trend.avg')} {stats[k]?.avg} · {t('trend.peak')}{' '}
                    {stats[k]?.peak}
                  </span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              {t('trend.allHidden')}
            </p>
          ) : (
            <BarChart
              labels={timeline.map((p) => p.date)}
              series={visible.map((k) => ({ name: k, color: colorOf(k) }))}
              values={visible.map((k) => timeline.map((p) => p.points[k] ?? 0))}
              height={200}
            />
          )}

          {/* Açıklama: bu değerler ne? */}
          <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-500">
            <span className="font-semibold text-gray-600">
              {t('trend.explainTitle')}{' '}
            </span>
            {t('trend.explain')}
          </div>
        </Card>
      ) : data ? (
        <p className="text-sm text-gray-400">{t('trend.empty')}</p>
      ) : null}
    </div>
  );
}
