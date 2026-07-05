'use client';
// app/embed/[publicKey]/page.tsx — 3. parti sitelere iframe ile gömülen PUBLIC lead formu.
// Auth gerektirmez; config'i public uçtan çeker, /public/.../submit'e gönderir (FORM kanalı).
// v4.7: uluslararası telefon (IntlPhoneInput) + alan ayarları (placeholder, min/max, maxLength,
// pattern, özel hata mesajı). İstemci doğrulaması sunucu kuralını yansıtır; asıl kontrol sunucuda.
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { IntlPhoneInput } from '@/components/molecules/IntlPhoneInput';
import type { LeadFormField } from '@/types';

interface PublicConfig {
  name: string;
  fields: LeadFormField[];
  buttonColor: string;
  buttonLabel: string;
  successMessage: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

// Tek alanı ayarlarına göre doğrula → hata metni veya null.
function validateField(f: LeadFormField, raw: string): string | null {
  const value = (raw ?? '').trim();
  const label = f.label || f.key;
  const msg = (fallback: string) => f.errorMessage || fallback;
  if (value === '') return f.required ? msg(`${label} zorunludur.`) : null;
  const type = f.type ?? 'text';
  if (type === 'email' && !EMAIL_RE.test(value))
    return msg(`${label} geçerli bir e-posta olmalı.`);
  if (type === 'phone' && !E164_RE.test(value))
    return msg(`${label} geçerli bir uluslararası telefon olmalı.`);
  if (type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return msg(`${label} sayı olmalı.`);
    if (f.min != null && n < f.min) return msg(`${label} en az ${f.min} olmalı.`);
    if (f.max != null && n > f.max)
      return msg(`${label} en fazla ${f.max} olmalı.`);
  }
  if (f.minLength != null && value.length < f.minLength)
    return msg(`${label} en az ${f.minLength} karakter olmalı.`);
  if (f.maxLength != null && value.length > f.maxLength)
    return msg(`${label} en fazla ${f.maxLength} karakter olmalı.`);
  if (f.pattern) {
    try {
      if (!new RegExp(f.pattern).test(value))
        return msg(`${label} istenen biçimde değil.`);
    } catch {
      /* geçersiz regex → atla */
    }
  }
  return null;
}

export default function EmbedFormPage({
  params,
}: {
  params: { publicKey: string };
}) {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>(
    'idle',
  );

  useEffect(() => {
    fetch(`/api/v1/public/lead-forms/${params.publicKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setCfg(j.data as PublicConfig))
      .catch(() => setNotFound(true));
  }, [params.publicKey]);

  const setVal = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfg) return;
    // İstemci doğrulaması: tüm alanları kontrol et.
    const next: Record<string, string> = {};
    for (const f of cfg.fields) {
      const err = validateField(f, values[f.key] ?? '');
      if (err) next[f.key] = err;
    }
    setErrors(next);
    setServerErr(null);
    if (Object.keys(next).length > 0) return;

    setState('sending');
    try {
      const res = await fetch(
        `/api/v1/public/lead-forms/${params.publicKey}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        },
      );
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // Sunucu doğrulama mesajını göster (istemci atlanmış olabilir).
        setServerErr(j?.error?.message ?? t('embed.error'));
        setState('idle');
        return;
      }
      const redirect = j?.data?.redirectUrl as string | null;
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      setState('done');
    } catch {
      setState('error');
    }
  };

  if (notFound) {
    return (
      <main className="p-6 text-sm text-gray-600">{t('embed.notFound')}</main>
    );
  }
  if (!cfg) {
    return <main className="p-6 text-sm text-gray-400">…</main>;
  }
  if (state === 'done') {
    return (
      <main className="p-6 text-sm text-emerald-700">
        {cfg.successMessage || t('embed.thanks')}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-4 text-lg font-semibold text-gray-800">{cfg.name}</h1>
      <form onSubmit={submit} noValidate className="space-y-3">
        {cfg.fields.map((f) => {
          const err = errors[f.key];
          const border = err ? 'border-red-400' : 'border-gray-300';
          return (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-medium text-gray-600">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === 'phone' ? (
                <IntlPhoneInput
                  value={values[f.key] ?? ''}
                  onChange={(v) => setVal(f.key, v)}
                  defaultCountry={f.defaultCountry}
                  required={f.required}
                  placeholder={f.placeholder}
                  invalid={!!err}
                />
              ) : f.type === 'textarea' ? (
                <textarea
                  rows={3}
                  required={f.required}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  className={`w-full rounded-md border ${border} px-3 py-2 text-sm`}
                />
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : (f.type ?? 'text')}
                  required={f.required}
                  placeholder={f.placeholder}
                  maxLength={f.type === 'number' ? undefined : f.maxLength}
                  min={f.type === 'number' ? f.min : undefined}
                  max={f.type === 'number' ? f.max : undefined}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  className={`w-full rounded-md border ${border} px-3 py-2 text-sm`}
                />
              )}
              {f.helpText && !err && (
                <p className="mt-1 text-xs text-gray-400">{f.helpText}</p>
              )}
              {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
            </div>
          );
        })}
        {serverErr && <p className="text-sm text-red-600">{serverErr}</p>}
        {state === 'error' && (
          <p className="text-sm text-red-600">{t('embed.error')}</p>
        )}
        <button
          type="submit"
          disabled={state === 'sending'}
          style={{ backgroundColor: cfg.buttonColor }}
          className="w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {state === 'sending'
            ? t('embed.sending')
            : cfg.buttonLabel || t('embed.send')}
        </button>
      </form>
    </main>
  );
}
