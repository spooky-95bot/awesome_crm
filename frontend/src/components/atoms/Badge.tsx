// src/components/atoms/Badge.tsx
const tones: Record<string, string> = {
  gray: 'bg-elysence-cream text-elysence-ink/80',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  indigo: 'bg-brand-100 text-brand-700',
};

export function Badge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
