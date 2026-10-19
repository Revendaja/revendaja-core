'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  prefix?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, prefix, className, id, ...props },
  ref
) {
  const inputId = id ?? props.name ?? label;

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold text-ink-500">
        {label}
      </label>
      <div
        className={cn(
          'flex h-12 items-center rounded-2xl border bg-ink-50 px-4 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-500',
          error ? 'border-danger' : 'border-transparent'
        )}
      >
        {prefix && <span className="mr-2 text-sm font-semibold text-ink-400">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-full w-full bg-transparent text-sm font-medium text-ink-900 placeholder:text-ink-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(function PasswordField(
  { label, error, className, id, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? props.name ?? label;

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold text-ink-500">
        {label}
      </label>
      <div
        className={cn(
          'flex h-12 items-center rounded-2xl border bg-ink-50 px-4 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-500',
          error ? 'border-danger' : 'border-transparent'
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={cn(
            'h-full w-full bg-transparent text-sm font-medium text-ink-900 placeholder:text-ink-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="ml-2 shrink-0 text-xs font-bold text-ink-400 hover:text-ink-700"
          tabIndex={-1}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
});
