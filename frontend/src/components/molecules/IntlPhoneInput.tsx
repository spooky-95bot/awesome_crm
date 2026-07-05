'use client';
// src/components/molecules/IntlPhoneInput.tsx
// Uluslararası telefon girişi: ülke seçici (bayrak + kod) + ulusal numara → E.164 değeri.
// Harici bağımlılık yok. Controlled: value = E.164 string, onChange(e164).
import { useMemo } from 'react';
import { COUNTRIES, findCountry, splitE164, toE164 } from '@/lib/countries';

export function IntlPhoneInput({
  value,
  onChange,
  defaultCountry,
  required,
  placeholder,
  invalid,
  id,
}: {
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: string;
  required?: boolean;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
}) {
  const parts = useMemo(
    () => splitE164(value, defaultCountry),
    [value, defaultCountry],
  );
  const country = findCountry(parts.iso2);

  const setCountry = (iso2: string) => {
    const c = findCountry(iso2);
    onChange(toE164(c.dial, parts.national));
  };
  const setNational = (national: string) => {
    onChange(toE164(country.dial, national));
  };

  const border = invalid ? 'border-red-400' : 'border-gray-300';
  return (
    <div className={`flex items-stretch gap-2`}>
      <select
        aria-label="country"
        value={country.iso2}
        onChange={(e) => setCountry(e.target.value)}
        className={`w-28 shrink-0 rounded-md border ${border} bg-white px-2 py-2 text-sm`}
      >
        {COUNTRIES.map((c) => (
          <option key={c.iso2} value={c.iso2}>
            {c.flag} +{c.dial}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        required={required}
        placeholder={placeholder ?? '5xx xxx xx xx'}
        value={parts.national}
        onChange={(e) => setNational(e.target.value)}
        className={`w-full rounded-md border ${border} px-3 py-2 text-sm`}
      />
    </div>
  );
}
