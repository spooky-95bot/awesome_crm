// src/components/atoms/Input.tsx
import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = '', ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-md border border-elysence-gold/30 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${className}`}
      {...rest}
    />
  );
});
