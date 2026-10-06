// src/components/atoms/Card.tsx
export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-elysence-gold/20 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
