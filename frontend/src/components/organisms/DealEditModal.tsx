'use client';
// src/components/organisms/DealEditModal.tsx — deal alan düzenleme + aşama taşıma + silme.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Modal } from '../molecules/Modal';
import { FormField } from '../molecules/FormField';
import { PhoneNumberField } from '../atoms/PhoneNumberField';
import { Button } from '../atoms/Button';
import type { Board, Deal } from '@/types';

export function DealEditModal({
  deal,
  board,
  onClose,
}: {
  deal: Deal;
  board: Board;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: deal.title ?? '',
    company: deal.company ?? '',
    value: deal.value ?? '',
    currency: deal.currency ?? 'EUR',
    contactName: deal.contactName ?? '',
    email: deal.email ?? '',
    phone: deal.phone ?? '',
  });
  const [stageId, setStageId] = useState(deal.stageId);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['board'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      // 1) Alan güncelle (yalnız dolu alanlar; boş e-posta/değer doğrulamaya takılır).
      const payload: Record<string, unknown> = { title: form.title.trim() };
      if (form.company.trim()) payload.company = form.company.trim();
      if (form.contactName.trim()) payload.contactName = form.contactName.trim();
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.value.trim()) {
        payload.value = form.value.trim();
        payload.currency = form.currency || 'EUR';
      }
      await api.patch(`/deals/${deal.id}`, payload);
      // 2) Aşama değiştiyse taşı (ayrı uç).
      if (stageId !== deal.stageId) {
        await api.patch(`/deals/${deal.id}/move`, { toStageId: stageId });
      }
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async () => {
      await api.delete(`/deals/${deal.id}`);
    },
    onSuccess: refresh,
  });

  return (
    <Modal title={t('deal.editTitle')} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          id="e-title"
          label={`${t('field.subject')} *`}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
        <FormField
          id="e-company"
          label={t('field.company')}
          value={form.company}
          onChange={(e) => set('company', e.target.value)}
        />
        <FormField
          id="e-value"
          label={t('field.value')}
          placeholder="12000.50"
          value={form.value}
          onChange={(e) => set('value', e.target.value)}
        />
        <FormField
          id="e-currency"
          label={t('field.currency')}
          maxLength={3}
          value={form.currency}
          onChange={(e) => set('currency', e.target.value.toUpperCase())}
        />
        <FormField
          id="e-contact"
          label={t('field.contactName')}
          value={form.contactName}
          onChange={(e) => set('contactName', e.target.value)}
        />
        <FormField
          id="e-email"
          label={t('field.email')}
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
        />
        <PhoneNumberField
          id="e-phone"
          label={t('field.phone')}
          value={form.phone}
          onChange={(v) => set('phone', v)}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">
            {t('field.stage')}
          </label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {board.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            disabled={!form.title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? '…' : t('common.save')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
        {can('deal.delete') && (
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`${t('common.delete')}?`)) {
                remove.mutate();
              }
            }}
          >
            {remove.isPending ? '…' : t('common.delete')}
          </Button>
        )}
      </div>

      {(save.isError || remove.isError) && (
        <p className="mt-2 text-sm text-red-600">{t('common.error')}</p>
      )}
    </Modal>
  );
}
