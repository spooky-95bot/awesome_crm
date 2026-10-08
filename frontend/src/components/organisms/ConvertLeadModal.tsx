'use client';
// src/components/organisms/ConvertLeadModal.tsx
// "Dönüştür" → lead bilgileriyle dolu anlaşma düzenleme popup'ı; opsiyonel düzenleyip
// POST /leads/:id/convert ile Contact+Deal'e çevirir (hedef stage seçilebilir).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Modal } from '../molecules/Modal';
import { FormField } from '../molecules/FormField';
import { PhoneNumberField } from '../atoms/PhoneNumberField';
import { Button } from '../atoms/Button';
import type { UnqualifiedLead } from '@/types';

interface Stage {
  id: string;
  name: string;
}
interface Pipeline {
  id: string;
  isDefault: boolean;
  stages: Stage[];
}

export function ConvertLeadModal({
  lead,
  onClose,
  onConverted,
}: {
  lead: UnqualifiedLead;
  onClose: () => void;
  onConverted: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  const [form, setForm] = useState({
    title: fullName,
    company: lead.companyName ?? '',
    value: '',
    currency: 'EUR',
    contactName: fullName,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    stageId: '',
  });
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pipelines = useQuery({
    queryKey: ['pipelines-convert'],
    queryFn: async () =>
      unwrap<Pipeline[]>((await api.get('/pipelines')).data),
  });
  const pipeline =
    pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const stages = pipeline?.stages ?? [];

  const convert = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      if (form.title.trim() && form.title.trim() !== fullName)
        payload.title = form.title.trim();
      if (form.company.trim()) payload.company = form.company.trim();
      if (form.contactName.trim() && form.contactName.trim() !== fullName)
        payload.contactName = form.contactName.trim();
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.value.trim()) {
        payload.value = form.value.trim();
        payload.currency = form.currency || 'EUR';
      }
      if (form.stageId) payload.stageId = form.stageId;
      await api.post(`/leads/${lead.id}/convert`, payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      onConverted();
      onClose();
    },
  });

  return (
    <Modal title={t('lead.convertTitle')} onClose={onClose}>
      <p className="mb-3 text-xs text-gray-500">{t('lead.convertHint')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          id="cv-title"
          label={t('field.subject')}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
        <FormField
          id="cv-company"
          label={t('field.company')}
          value={form.company}
          onChange={(e) => set('company', e.target.value)}
        />
        <FormField
          id="cv-value"
          label={t('field.value')}
          placeholder="12000.50"
          value={form.value}
          onChange={(e) => set('value', e.target.value)}
        />
        <FormField
          id="cv-currency"
          label={t('field.currency')}
          maxLength={3}
          value={form.currency}
          onChange={(e) => set('currency', e.target.value.toUpperCase())}
        />
        <FormField
          id="cv-contact"
          label={t('field.contactName')}
          value={form.contactName}
          onChange={(e) => set('contactName', e.target.value)}
        />
        <FormField
          id="cv-email"
          label={t('field.email')}
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
        />
        <PhoneNumberField
          id="cv-phone"
          label={t('field.phone')}
          value={form.phone}
          onChange={(v) => set('phone', v)}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">
            {t('field.stage')}
          </label>
          <select
            value={form.stageId}
            onChange={(e) => set('stageId', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {stages.map((s, i) => (
              <option key={s.id} value={i === 0 ? '' : s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          disabled={convert.isPending || !form.title.trim()}
          onClick={() => convert.mutate()}
        >
          {convert.isPending ? '…' : t('act.convert')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {convert.isError && (
          <span className="text-sm text-red-600">{t('common.error')}</span>
        )}
      </div>
    </Modal>
  );
}
