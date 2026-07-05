'use client';
// src/components/organisms/LeadFormModal.tsx
// Lead intake formu oluştur/düzenle + embed kodu & webhook paylaşım paneli.
import { useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { COUNTRIES } from '@/lib/countries';
import { Modal } from '../molecules/Modal';
import { FormField } from '../molecules/FormField';
import { Textarea } from '../atoms/Textarea';
import { Button } from '../atoms/Button';
import type { LeadForm, LeadFormField } from '@/types';

const FIELD_TYPES = ['text', 'email', 'tel', 'phone', 'textarea', 'number'];

function CopyRow({
  value,
  label,
  copyText,
  copiedText,
  mono,
}: {
  value: string;
  label: string;
  copyText: string;
  copiedText: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-2">
      <p className="mb-1 text-xs font-medium text-gray-600">{label}</p>
      <div className="flex items-start gap-2">
        <code
          className={`flex-1 break-all rounded-md bg-gray-50 p-2 text-xs ${
            mono ? 'font-mono' : ''
          }`}
        >
          {value}
        </code>
        <Button
          variant="secondary"
          className="shrink-0 px-2 py-1 text-xs"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? copiedText : copyText}
        </Button>
      </div>
    </div>
  );
}

export function LeadFormModal({
  form,
  onClose,
  onSaved,
}: {
  form: LeadForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isNew = form === null;
  const [name, setName] = useState(form?.name ?? '');
  const [fields, setFields] = useState<LeadFormField[]>(
    form?.fields ?? [
      { key: 'firstName', label: 'Ad', type: 'text', required: true },
      { key: 'email', label: 'E-posta', type: 'email', required: true },
    ],
  );
  const [buttonColor, setButtonColor] = useState(form?.buttonColor ?? '#4f46e5');
  const [buttonLabel, setButtonLabel] = useState(form?.buttonLabel ?? 'Gönder');
  const [successMessage, setSuccessMessage] = useState(
    form?.successMessage ?? '',
  );
  const [redirectUrl, setRedirectUrl] = useState(form?.redirectUrl ?? '');
  const [isActive, setIsActive] = useState(form?.isActive ?? true);
  const [openSettings, setOpenSettings] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Oluşturma sonrası tek seferlik secret + paylaşım için.
  const [created, setCreated] = useState<LeadForm | null>(null);
  const [secret, setSecret] = useState<string | null>(form?.secret ?? null);

  const shareForm = created ?? form;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const setField = (i: number, patch: Partial<LeadFormField>) =>
    setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  // Sayısal ayar: boş → undefined (alanı temizle), aksi halde sayı.
  const setNum = (i: number, key: keyof LeadFormField, v: string) =>
    setField(i, { [key]: v === '' ? undefined : Number(v) });

  const save = async () => {
    setBusy(true);
    setErr(null);
    const payload = {
      name: name.trim(),
      fields,
      buttonColor,
      buttonLabel,
      successMessage: successMessage || undefined,
      redirectUrl: redirectUrl || undefined,
    };
    try {
      if (isNew) {
        const res = await api.post('/lead-forms', payload);
        const data = res.data.data as LeadForm;
        setCreated(data);
        setSecret(data.secret ?? null);
        onSaved();
      } else {
        await api.patch(`/lead-forms/${form.id}`, { ...payload, isActive });
        onSaved();
        onClose();
      }
    } catch {
      setErr(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    if (!form) return;
    const res = await api.get(`/lead-forms/${form.id}/secret`);
    setSecret(res.data.data.secret as string);
  };
  const rotate = async () => {
    if (!form) return;
    if (!confirm(t('lf.rotateConfirm'))) return;
    const res = await api.post(`/lead-forms/${form.id}/rotate-secret`);
    setSecret(res.data.data.secret as string);
  };

  return (
    <Modal
      title={isNew ? t('lf.newTitle') : `${t('lf.editPrefix')}: ${form.name}`}
      onClose={onClose}
    >
      {/* Oluşturma sonrası tek seferlik secret notu */}
      {created && (
        <p className="mb-3 rounded-md bg-emerald-50 p-2 text-xs text-emerald-700">
          {t('lf.secretOnce')}
        </p>
      )}

      {!created && (
        <>
          <FormField
            id="lf-name"
            label={`${t('field.name')} *`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <p className="mb-1 mt-3 text-sm font-medium text-gray-600">
            {t('lf.fields')}
          </p>
          {fields.map((f, i) => {
            const type = f.type ?? 'text';
            const isNumber = type === 'number';
            const isText = ['text', 'textarea', 'tel', 'email'].includes(type);
            const open = openSettings === i;
            return (
              <div
                key={i}
                className="mb-2 rounded-md border border-gray-100 bg-gray-50/50 p-1.5"
              >
                <div className="grid grid-cols-12 items-center gap-2">
                  <input
                    className="col-span-3 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder={t('lf.fieldKey')}
                    value={f.key}
                    onChange={(e) => setField(i, { key: e.target.value })}
                  />
                  <input
                    className="col-span-3 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder={t('lf.fieldLabel')}
                    value={f.label}
                    onChange={(e) => setField(i, { label: e.target.value })}
                  />
                  <select
                    className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    value={type}
                    onChange={(e) => setField(i, { type: e.target.value })}
                  >
                    {FIELD_TYPES.map((tp) => (
                      <option key={tp} value={tp}>
                        {tp === 'phone' ? t('lf.typePhone') : tp}
                      </option>
                    ))}
                  </select>
                  <label className="col-span-2 flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) =>
                        setField(i, { required: e.target.checked })
                      }
                    />
                    {t('lf.fieldRequired')}
                  </label>
                  <button
                    type="button"
                    className={`col-span-1 ${open ? 'text-brand-600' : 'text-gray-400'} hover:text-brand-700`}
                    onClick={() => setOpenSettings(open ? null : i)}
                    aria-label={t('lf.settings')}
                    title={t('lf.settings')}
                  >
                    ⚙️
                  </button>
                  <button
                    type="button"
                    className="col-span-1 text-gray-400 hover:text-red-600"
                    onClick={() =>
                      setFields(fields.filter((_, idx) => idx !== i))
                    }
                    aria-label={t('auto.remove')}
                  >
                    ✕
                  </button>
                </div>

                {open && (
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-white p-2">
                    <label className="col-span-2 text-xs text-gray-500">
                      {t('lf.placeholder')}
                      <input
                        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                        value={f.placeholder ?? ''}
                        onChange={(e) =>
                          setField(i, { placeholder: e.target.value })
                        }
                      />
                    </label>
                    <label className="col-span-2 text-xs text-gray-500">
                      {t('lf.helpText')}
                      <input
                        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                        value={f.helpText ?? ''}
                        onChange={(e) =>
                          setField(i, { helpText: e.target.value })
                        }
                      />
                    </label>

                    {isNumber && (
                      <>
                        <label className="text-xs text-gray-500">
                          {t('lf.min')}
                          <input
                            type="number"
                            className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                            value={f.min ?? ''}
                            onChange={(e) => setNum(i, 'min', e.target.value)}
                          />
                        </label>
                        <label className="text-xs text-gray-500">
                          {t('lf.max')}
                          <input
                            type="number"
                            className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                            value={f.max ?? ''}
                            onChange={(e) => setNum(i, 'max', e.target.value)}
                          />
                        </label>
                      </>
                    )}

                    {isText && (
                      <>
                        <label className="text-xs text-gray-500">
                          {t('lf.minLength')}
                          <input
                            type="number"
                            className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                            value={f.minLength ?? ''}
                            onChange={(e) =>
                              setNum(i, 'minLength', e.target.value)
                            }
                          />
                        </label>
                        <label className="text-xs text-gray-500">
                          {t('lf.maxLength')}
                          <input
                            type="number"
                            className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                            value={f.maxLength ?? ''}
                            onChange={(e) =>
                              setNum(i, 'maxLength', e.target.value)
                            }
                          />
                        </label>
                        <label className="col-span-2 text-xs text-gray-500">
                          {t('lf.pattern')}
                          <input
                            className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 font-mono text-sm"
                            placeholder="^[A-Z0-9]+$"
                            value={f.pattern ?? ''}
                            onChange={(e) =>
                              setField(i, { pattern: e.target.value || undefined })
                            }
                          />
                        </label>
                      </>
                    )}

                    {type === 'phone' && (
                      <label className="col-span-2 text-xs text-gray-500">
                        {t('lf.defaultCountry')}
                        <select
                          className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                          value={f.defaultCountry ?? 'TR'}
                          onChange={(e) =>
                            setField(i, { defaultCountry: e.target.value })
                          }
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c.iso2} value={c.iso2}>
                              {c.flag} {c.name} (+{c.dial})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="col-span-2 text-xs text-gray-500">
                      {t('lf.errorMessage')}
                      <input
                        className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                        placeholder={t('lf.errorMessagePh')}
                        value={f.errorMessage ?? ''}
                        onChange={(e) =>
                          setField(i, {
                            errorMessage: e.target.value || undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
          <Button
            variant="ghost"
            className="text-xs"
            onClick={() =>
              setFields([
                ...fields,
                { key: '', label: '', type: 'text', required: false },
              ])
            }
          >
            {t('lf.addField')}
          </Button>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">
                {t('lf.buttonColor')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={buttonColor}
                  onChange={(e) => setButtonColor(e.target.value)}
                  className="h-9 w-12 rounded border border-gray-300"
                />
                <input
                  value={buttonColor}
                  onChange={(e) => setButtonColor(e.target.value)}
                  className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <FormField
              id="lf-btn"
              label={t('lf.buttonLabel')}
              value={buttonLabel}
              onChange={(e) => setButtonLabel(e.target.value)}
            />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-gray-600">
              {t('lf.successMessage')}
            </label>
            <Textarea
              rows={2}
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
            />
          </div>
          <div className="mt-3">
            <FormField
              id="lf-redirect"
              label={t('lf.redirectUrl')}
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
            />
          </div>

          {!isNew && (
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              {t('common.active')}
            </label>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button disabled={busy || !name.trim()} onClick={save}>
              {busy ? '…' : isNew ? t('common.create') : t('common.save')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </>
      )}

      {/* Paylaşım paneli: publicKey + embed + webhook + secret */}
      {shareForm && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          {!shareForm.isActive && (
            <p className="mb-2 text-xs text-amber-600">{t('lf.inactive')}</p>
          )}
          <CopyRow
            label={t('lf.embedTitle')}
            value={`<iframe src="${origin}/embed/${shareForm.publicKey}" style="width:100%;max-width:480px;height:560px;border:0" loading="lazy"></iframe>`}
            copyText={t('lf.copy')}
            copiedText={t('lf.copied')}
            mono
          />
          <p className="mb-3 text-xs text-gray-400">{t('lf.embedHint')}</p>

          <CopyRow
            label={t('lf.webhookTitle')}
            value={`${origin}/api/v1/webhooks/leads/${shareForm.publicKey}`}
            copyText={t('lf.copy')}
            copiedText={t('lf.copied')}
            mono
          />
          <p className="mb-3 text-xs text-gray-400">{t('lf.webhookHint')}</p>

          {secret ? (
            <CopyRow
              label={t('lf.secret')}
              value={secret}
              copyText={t('lf.copy')}
              copiedText={t('lf.copied')}
              mono
            />
          ) : (
            <Button
              variant="secondary"
              className="text-xs"
              onClick={reveal}
            >
              {t('lf.reveal')}
            </Button>
          )}
          {!isNew && (
            <Button variant="ghost" className="ml-2 text-xs" onClick={rotate}>
              {t('lf.rotate')}
            </Button>
          )}

          {created && (
            <div className="mt-4">
              <Button onClick={onClose}>{t('common.cancel')}</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
