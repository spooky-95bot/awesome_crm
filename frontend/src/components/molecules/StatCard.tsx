// src/components/molecules/StatCard.tsx
import { Card } from '../atoms/Card';

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-elysence-ink/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-elysence-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-elysence-ink/40">{hint}</p>}
    </Card>
  );
}
