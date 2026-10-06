'use client';
// app/(dashboard)/branding/page.tsx — marka (logo + uygulama adı) düzenleme.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBranding } from '@/lib/branding';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Textarea } from '@/components/atoms/Textarea';
import { FormField } from '@/components/molecules/FormField';
import { LogoMark } from '@/components/atoms/LogoMark';

const MAX = 400_000; // ~400 KB data URL

export default function BrandingPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const branding = useBranding();
  const manage = can('branding.manage');

  const [appName, setAppName] = useState('');
  const [logo, setLogo] = useState<string | null>(null); // pending data URL veya null
  const [svgText, setSvgText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Mevcut değerleri bir kez yükle.
  useEffect(() => {
    if (branding.data && !ready) {
      setAppName(branding.data.appName ?? '');
      setLogo(branding.data.logo ?? null);
      setReady(true);
    }
  }, [branding.data, ready]);

  const save = useMutation({
    mutationFn: async () =>
      api.patch('/branding', { appName, logo: logo ?? '' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }),
  });
  const reset = useMutation({
    mutationFn: async () => api.patch('/branding', { appName: '', logo: '' }),
    onSuccess: () => {
      setAppName('');
      setLogo(null);
      setSvgText('');
      qc.invalidateQueries({ queryKey: ['branding'] });
    },
  });

  const onFile = (file: File) => {
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (url.length > MAX) {
        setErr(t('brand.tooLarge'));
        return;
      }
      setLogo(url);
      setSvgText('');
    };
    reader.readAsDataURL(file);
  };

  const onSvg = (code: string) => {
    setSvgText(code);
    const trimmed = code.trim();
    if (!trimmed) return;
    const url = `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
    if (url.length > MAX) {
      setErr(t('brand.tooLarge'));
      return;
    }
    setErr(null);
    setLogo(url);
  };

  const name = appName || 'Elysence Partner';
  const Preview = () =>
    logo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt={name} style={{ height: 36, width: 'auto' }} className="max-w-[180px] object-contain" />
    ) : (
      <span className="flex items-center gap-2">
        <LogoMark size={34} />
        <span className="text-xl font-bold tracking-tight">{name}</span>
      </span>
    );

  return (
    <DashboardTemplate title="page.branding">
      <p className="mb-4 text-sm text-gray-500">{t('brand.hint')}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <FormField
            id="b-name"
            label={t('brand.appName')}
            value={appName}
            disabled={!manage}
            onChange={(e) => setAppName(e.target.value)}
          />

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-600">
              {t('brand.logo')}
            </label>
            <input
              type="file"
              accept="image/svg+xml,image/png,image/jpeg,image/webp"
              disabled={!manage}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700"
            />
            <p className="mb-1 mt-3 text-xs text-gray-500">{t('brand.pasteSvg')}</p>
            <Textarea
              rows={4}
              disabled={!manage}
              value={svgText}
              onChange={(e) => onSvg(e.target.value)}
              placeholder="<svg ...>…</svg>"
              className="font-mono text-xs"
            />
          </div>

          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

          {manage && (
            <div className="mt-4 flex items-center gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? '…' : t('common.save')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => reset.mutate()}
                disabled={reset.isPending}
              >
                {t('brand.reset')}
              </Button>
              {save.isError && (
                <span className="text-sm text-red-600">{t('common.error')}</span>
              )}
            </div>
          )}
        </Card>

        {/* Önizleme — açık (login) ve koyu (sidebar) zemin */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            {t('brand.preview')}
          </h3>
          <div className="mb-3 flex items-center rounded-lg border border-gray-200 bg-white p-4">
            <Preview />
          </div>
          <div className="flex items-center rounded-lg bg-gray-900 p-4 text-white">
            <Preview />
          </div>
        </Card>
      </div>
    </DashboardTemplate>
  );
}
