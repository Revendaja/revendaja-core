'use client';

import Link from 'next/link';
import { Icon } from '@/components/dashboard/icons';
import { STOCK_MAX, maskPriceInput, parseStockInput } from '@/lib/utils/format';

const INPUT =
  'h-11 w-full rounded-xl border bg-white px-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 disabled:opacity-60';

function borderFor(error: string | null | undefined) {
  return error ? 'border-danger' : 'border-ink-200 focus-within:border-primary-500 focus:border-primary-500';
}

export function PageHeader({ title, subtitle, backHref }: { title: string; subtitle?: string; backHref: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <Link
        href={backHref}
        aria-label="Voltar"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition hover:bg-ink-50"
      >
        <Icon name="chevronDown" size={18} className="rotate-90" />
      </Link>
      <div className="leading-tight">
        <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="text-xs text-ink-400">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Banner({ type, message }: { type: 'error' | 'info'; message: string }) {
  return (
    <p
      role={type === 'error' ? 'alert' : 'status'}
      className={`animate-fade-up mb-4 rounded-xl px-4 py-3 text-xs font-medium ${
        type === 'error' ? 'bg-danger-soft text-danger' : 'bg-primary-50 text-primary-700'
      }`}
    >
      {message}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-ink-600">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      )}
    </div>
  );
}

// Campo de preço com máscara de centavos: digitar "4990" forma "49,90".
export function MoneyField({
  label,
  hint,
  value,
  onChange,
  error,
  disabled,
  placeholder = '0,00',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <div className={`flex h-11 items-center rounded-xl border bg-white px-3 transition ${borderFor(error)}`}>
        <span className="mr-2 text-sm font-semibold text-ink-500">R$</span>
        <input
          value={value}
          onChange={(event) => onChange(maskPriceInput(event.target.value))}
          placeholder={placeholder}
          inputMode="numeric"
          disabled={disabled}
          aria-label={label}
          className="h-full w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 disabled:opacity-60"
        />
      </div>
    </Field>
  );
}

// Estoque inteiro de 0 a 1.000.000 com botões − / +.
export function StockField({
  label,
  hint,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 7);
    onChange(digits && Number(digits) > STOCK_MAX ? String(STOCK_MAX) : digits);
  }

  function step(delta: number) {
    const next = Math.min(STOCK_MAX, Math.max(0, (parseStockInput(value) ?? 0) + delta));
    onChange(String(next));
  }

  return (
    <Field label={label} hint={hint} error={error}>
      <div className={`flex h-11 items-center rounded-xl border bg-white px-1.5 transition ${borderFor(error)}`}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled}
          aria-label="Diminuir estoque"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-700 transition hover:bg-ink-100 disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M5 12h14" />
          </svg>
        </button>
        <input
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="0"
          inputMode="numeric"
          maxLength={7}
          disabled={disabled}
          aria-label={label}
          className="h-full min-w-0 flex-1 bg-transparent text-center text-base font-semibold text-ink-900 outline-none placeholder:text-ink-400 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled}
          aria-label="Aumentar estoque"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </Field>
  );
}

export function TextInput({
  value,
  onChange,
  error,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${INPUT} ${borderFor(error)}`}
    />
  );
}

// Switch estilo pill (on/off), usado por exemplo em "Visível na vitrine" e "Colocar em promoção".
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-success' : 'bg-ink-200'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// Linha com rótulo + descrição à esquerda e um Toggle à direita (ex.: "Visível na vitrine").
export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        {description && <p className="mt-0.5 text-xs text-ink-400">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

export function SubmitButton({
  children,
  loading,
  disabled,
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="flex h-12 w-full items-center justify-center rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? 'Salvando...' : children}
    </button>
  );
}
