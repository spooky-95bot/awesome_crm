'use client';
// src/components/organisms/BrandWizardModal.tsx — marka onboarding anketi (niş profili).
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Modal } from '../molecules/Modal';
import { FormField } from '../molecules/FormField';
import { Textarea } from '../atoms/Textarea';
import { Button } from '../atoms/Button';

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function BrandWizardModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t } = useI18n();
  const [f, setF] = useState({
    name: '',
    sector: '',
    niche: '',
    description: '',
    targetAudience: '',
    priceBand: 'mid',
    markets: 'FR',
    keywords: '',
    knownCompetitors: '',
  });
  const set = (k: keyof typeof f, v: string) =>
    setF((s) => ({ ...s, [k]: v }));

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.post('/brands', {
        name: f.name.trim(),
        sector: f.sector || undefined,
        niche: f.niche || undefined,
        description: f.description || undefined,
        targetAudience: f.targetAudience || undefined,
        priceBand: f.priceBand,
        markets: list(f.markets).map((m) => m.toUpperCase()),
        keywords: list(f.keywords),
        knownCompetitors: list(f.knownCompetitors),
      });
      return res.data.data.id as string;
    },
    onSuccess: (id) => onSaved(id),
  });

  return (
    <Modal title={t('brand.new')} onClose={onClose}>
      <p className="mb-3 text-xs text-gray-500">{t('brand.wizardHint')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          id="b-name"
          label={`${t('brand.name')} *`}
          value={f.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <FormField
          id="b-sector"
          label={t('brand.sector')}
          placeholder="Giyim"
          value={f.sector}
          onChange={(e) => set('sector', e.target.value)}
        />
        <FormField
          id="b-niche"
          label={t('brand.niche')}
          placeholder="Erkek sokak giyimi"
          value={f.niche}
          onChange={(e) => set('niche', e.target.value)}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">
            {t('brand.priceBand')}
          </label>
          <select
            value={f.priceBand}
            onChange={(e) => set('priceBand', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="budget">{t('brand.priceBudget')}</option>
            <option value="mid">{t('brand.priceMid')}</option>
            <option value="premium">{t('brand.pricePremium')}</option>
            <option value="luxury">{t('brand.priceLuxury')}</option>
          </select>
        </div>
        <FormField
          id="b-audience"
          label={t('brand.audience')}
          placeholder="18-30 erkek, şehirli"
          value={f.targetAudience}
          onChange={(e) => set('targetAudience', e.target.value)}
        />
        <FormField
          id="b-markets"
          label={t('brand.markets')}
          placeholder="FR, BE"
          value={f.markets}
          onChange={(e) => set('markets', e.target.value)}
        />
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-sm font-medium text-gray-600">
          {t('brand.description')}
        </label>
        <Textarea
          rows={2}
          value={f.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>
      <div className="mt-3">
        <FormField
          id="b-keywords"
          label={t('brand.keywords')}
          placeholder="streetwear, oversize tişört"
          value={f.keywords}
          onChange={(e) => set('keywords', e.target.value)}
        />
      </div>
      <div className="mt-3">
        <FormField
          id="b-comp"
          label={t('brand.competitors')}
          value={f.knownCompetitors}
          onChange={(e) => set('knownCompetitors', e.target.value)}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || !f.name.trim()}
        >
          {create.isPending ? '…' : t('common.create')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {create.isError && (
          <span className="text-sm text-red-600">{t('common.error')}</span>
        )}
      </div>
    </Modal>
  );
}
