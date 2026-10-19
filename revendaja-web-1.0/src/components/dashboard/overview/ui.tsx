import { Icon } from '../icons';

// Peças compartilhadas pelos cartões do painel (todos com dados fictícios por enquanto).

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
      {right}
    </div>
  );
}

export function DotsButton() {
  return (
    <button
      type="button"
      aria-label="Mais opções"
      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
    >
      <Icon name="dots" size={18} strokeWidth={2.4} />
    </button>
  );
}

// Valor monetário com o símbolo em laranja, como no layout de referência.
export function Money({
  value,
  symbol = 'R$',
  className = '',
}: {
  value: number;
  symbol?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="mr-1.5 text-primary-500">{symbol}</span>
      {value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function GrowthPill({ value, negative = false }: { value: string; negative?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        negative ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={negative ? 'rotate-90' : ''}>
        <path d="M7 17 17 7M8 7h9v9" />
      </svg>
      {value}
    </span>
  );
}
