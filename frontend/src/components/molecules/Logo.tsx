'use client';
// src/components/molecules/Logo.tsx — Logo Elysence Partner (image ou texte par défaut).
import { useBranding } from '@/lib/branding';
import { LogoMark } from '../atoms/LogoMark';

export function Logo({
  size = 30,
  textClass = 'text-base text-gray-900',
}: {
  size?: number;
  textClass?: string;
}) {
  const { data } = useBranding();
  const name = data?.appName || 'Elysence Partner';

  if (data?.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.logo}
        alt={name}
        style={{ height: size, width: 'auto' }}
        className="max-w-[170px] object-contain"
      />
    );
  }
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} />
      <span className={`font-bold tracking-tight ${textClass}`}>{name}</span>
    </span>
  );
}
