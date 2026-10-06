'use client';
// src/components/atoms/PhoneNumberField.tsx
// Uluslararası telefon girişi (ülke kodu seçicili). react-phone-number-input
// libphonenumber-js (Google libphonenumber JS portu) kullanır. Değer E.164 ('+90…').
import PhoneInput from 'react-phone-number-input';
import { Label } from './Label';

export function PhoneNumberField({
  id,
  label,
  value,
  onChange,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex items-center rounded-md border border-gray-300 px-2 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        <PhoneInput
          id={id}
          international
          defaultCountry="FR"
          value={value || undefined}
          onChange={(v) => onChange(v ?? '')}
          numberInputProps={{
            className: 'w-full border-0 bg-transparent py-2 text-sm outline-none',
          }}
        />
      </div>
    </div>
  );
}
