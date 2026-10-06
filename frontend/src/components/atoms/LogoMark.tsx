'use client';
// src/components/atoms/LogoMark.tsx — Logo Elysence Partner (SVG officiel).
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-elysence.svg"
      alt="Elysence Partner"
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: 'auto', maxWidth: size }}
    />
  );
}
