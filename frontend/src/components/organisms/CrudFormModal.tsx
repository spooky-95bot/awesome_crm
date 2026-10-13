'use client';
// src/components/organisms/CrudFormModal.tsx
// Formulaire CRUD réutilisable (créer/modifier/supprimer). Alimenté par la définition des champs.
// Seuls les champs remplis sont envoyés (vide = pas de modification / optionnel ignoré).
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Modal } from '../molecules/Modal';
import { FormField } from '../molecules/FormField';
import { Textarea } from '../atoms/Textarea';
import { PhoneNumberField } from '../atoms/PhoneNumberField';
import { Button } from '../atoms/Button';

export interface CrudField {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'password'
    | 'phone'
    | 'number'
    | 'select'
    | 'date'
    | 'datetime'
    | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export function CrudFormModal({
  title,
  fields,
  initial = {},
  submitLabel,
  onClose,
  onSubmit,
  onDelete,
}: {
  title: string;
  fields: CrudField[];
  initial?: Record<string, string>;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of fields) o[f.key] = initial[f.key] ?? '';
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));
  const missing = fields.some((f) => f.required && !vals[f.key]?.trim());

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, string> = {};
      for (const f of fields) {
        let v = (vals[f.key] ?? '').trim();
        if (!v) continue;
        if (f.type === 'datetime') v = new Date(v).toISOString();
        payload[f.key] = v;
      }
      await onSubmit(payload);
      onClose();
    } catch {
      setErr(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!onDelete) return;
    if (!confirm('Voulez-vous vraiment supprimer cet enregistrement ?')) return;
    setBusy(true);
    setErr(null);
    try {
      await onDelete();
      onClose();
    } catch {
      setErr(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const inputType = (t?: CrudField['type']) =>
    t === 'datetime'
      ? 'datetime-local'
      : t === 'date'
        ? 'date'
        : t === 'email'
          ? 'email'
          : t === 'password'
            ? 'password'
            : 'text';

  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            {f.type === 'select' ? (
              <>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  {t(f.label)}
                  {f.required ? ' *' : ''}
                </label>
                <select
                  value={vals[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">— seç —</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </>
            ) : f.type === 'textarea' ? (
              <>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  {t(f.label)}
                </label>
                <Textarea
                  rows={3}
                  value={vals[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </>
            ) : f.type === 'phone' ? (
              <PhoneNumberField
                id={`cf-${f.key}`}
                label={t(f.label) + (f.required ? ' *' : '')}
                value={vals[f.key]}
                onChange={(v) => set(f.key, v)}
              />
            ) : (
              <FormField
                id={`cf-${f.key}`}
                label={t(f.label) + (f.required ? ' *' : '')}
                type={inputType(f.type)}
                placeholder={f.placeholder}
                value={vals[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Button disabled={busy || missing} onClick={submit}>
            {busy ? '…' : (submitLabel ?? t('common.save'))}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
        {onDelete && (
          <Button variant="danger" disabled={busy} onClick={del}>
            {t('common.delete')}
          </Button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </Modal>
  );
}
