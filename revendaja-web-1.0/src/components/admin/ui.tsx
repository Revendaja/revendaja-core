import type { ReactNode } from 'react';
import { PLAN_LABELS, type PlanId } from '@/lib/admin/costModel';

// Peças visuais compartilhadas pelas páginas de administração.

export const formatInt = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export const formatBrl = (value: number, digits = 2) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatPct(value: number | null, digits = 1) {
  return value === null ? '—' : `${value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

// 12.400 -> "12,4 mil"; 3.200.000 -> "3,2 mi".
export function formatCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return formatInt(value);
}

// "2026-11" -> "nov/2026".
export function formatPeriod(key: string) {
  const [year, month] = key.split('-').map(Number);
  const name = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${name}/${year}`;
}

export function formatDay(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  good: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const PLAN_TONES: Record<PlanId, Tone> = { free: 'neutral', starter: 'warn', premium: 'good', business: 'good' };

export function PlanBadge({ plan }: { plan: PlanId }) {
  return <Badge tone={PLAN_TONES[plan]}>{PLAN_LABELS[plan]}</Badge>;
}

export function SubscriptionBadge({ status, cancelAtPeriodEnd }: { status: string | null; cancelAtPeriodEnd: boolean }) {
  if (!status) return <span className="text-[12px] text-ink-400">—</span>;
  if (cancelAtPeriodEnd) return <Badge tone="warn">cancela no fim</Badge>;
  const labels: Record<string, [string, Tone]> = {
    active: ['ativa', 'good'],
    trialing: ['teste', 'good'],
    past_due: ['atrasada', 'bad'],
    canceled: ['cancelada', 'neutral'],
    unpaid: ['não paga', 'bad'],
    incomplete: ['incompleta', 'warn'],
  };
  const [label, tone] = labels[status] ?? [status, 'neutral' as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

// Indicador de um número: título, valor grande e uma linha de apoio.
export function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-ink-900';
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <p className="text-[12px] font-medium text-ink-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-[12px] text-ink-400">{hint}</p>}
    </div>
  );
}

// Variação percentual de um período para o outro.
export function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-ink-400">sem base de comparação</span>;
  const change = ((current - previous) / previous) * 100;
  const good = change >= 0;
  return (
    <span className={good ? 'text-success' : 'text-danger'}>
      {good ? '▲' : '▼'} {Math.abs(change).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% vs. período anterior
    </span>
  );
}

// Colunas simples, sem biblioteca de gráficos.
export function Bars({
  data,
  format = formatInt,
  color = 'bg-primary-500',
  height = 112,
}: {
  data: { label: string; value: number }[];
  format?: (value: number) => string;
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  if (data.length === 0) return <p className="py-6 text-center text-[13px] text-ink-400">Sem dados no período.</p>;
  return (
    <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label="Gráfico de colunas">
      {data.map((item) => (
        <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${item.label}: ${format(item.value)}`}>
          <div
            className={`w-full rounded-t-md ${color} transition-all`}
            style={{ height: `${Math.max(item.value > 0 ? 4 : 0, (item.value / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function BarLabels({ labels }: { labels: string[] }) {
  return (
    <div className="mt-1.5 flex gap-1.5">
      {labels.map((label, index) => (
        <span key={`${label}-${index}`} className="min-w-0 flex-1 truncate text-center text-[10px] text-ink-400">
          {label}
        </span>
      ))}
    </div>
  );
}

// Barra de progresso horizontal (cota usada, participação por plano...).
export function Meter({ value, max, tone = 'neutral' }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === 'bad' ? 'bg-danger' : tone === 'warn' ? 'bg-warning' : tone === 'good' ? 'bg-success' : 'bg-primary-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wide text-ink-400">
            {head.map((cell, index) => (
              <th key={index} className="px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

export function QueryState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="h-7 w-7 animate-spin rounded-full border-3 border-ink-200 border-t-primary-500" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-danger-soft bg-danger-soft/50 p-5 text-center">
        <p className="text-[13px] text-danger">{error}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-ink-700 shadow-sm">
          Tentar de novo
        </button>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Gráficos do financeiro
// ---------------------------------------------------------------------------------------------

export type Segment = { label: string; value: number; color: string; hint?: string };

// Uma barra dividida em pedaços (ex.: para onde vai o dinheiro), com legenda em valor e percentual.
export function StackedBar({
  segments,
  total,
  format = (value: number) => formatBrl(value),
}: {
  segments: Segment[];
  total?: number;
  format?: (value: number) => string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const sum = total ?? visible.reduce((acc, segment) => acc + segment.value, 0);
  if (visible.length === 0 || sum <= 0) {
    return <p className="py-6 text-center text-[13px] text-ink-400">Sem valores para mostrar ainda.</p>;
  }
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded-lg bg-ink-100" role="img" aria-label="Barra de composição">
        {visible.map((segment) => (
          <div
            key={segment.label}
            className={`${segment.color} h-full transition-all`}
            style={{ width: `${(segment.value / sum) * 100}%` }}
            title={`${segment.label}: ${format(segment.value)}`}
          />
        ))}
      </div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {visible.map((segment) => (
          <li key={segment.label} className="flex items-start gap-2.5 text-[13px]">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm ${segment.color}`} />
            <div className="min-w-0 flex-1">
              <p className="text-ink-800">{segment.label}</p>
              {segment.hint && <p className="text-[12px] text-ink-400">{segment.hint}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold text-ink-900">{format(segment.value)}</p>
              <p className="text-[12px] text-ink-400">{formatPct((segment.value / sum) * 100, 0)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Duas barras por grupo (ex.: quanto cada plano cobra x quanto custa).
export function PairBars({
  data,
  aLabel,
  bLabel,
  aColor = 'bg-primary-500',
  bColor = 'bg-ink-300',
  format = (value: number) => formatBrl(value),
  height = 140,
}: {
  data: { label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
  aColor?: string;
  bColor?: string;
  format?: (value: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.flatMap((item) => [item.a, item.b]));
  return (
    <div>
      <div className="mb-3 flex gap-4 text-[12px] text-ink-500">
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${aColor}`} />
          {aLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${bColor}`} />
          {bLabel}
        </span>
      </div>
      <div className="flex items-end gap-4" style={{ height }} role="img" aria-label={`${aLabel} e ${bLabel} por grupo`}>
        {data.map((item) => (
          <div key={item.label} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1.5">
            {[
              { value: item.a, color: aColor, name: aLabel },
              { value: item.b, color: bColor, name: bLabel },
            ].map((bar) => (
              <div
                key={bar.name}
                className="flex h-full w-1/2 max-w-12 flex-col justify-end"
                title={`${item.label} — ${bar.name}: ${format(bar.value)}`}
              >
                <span className="mb-1 text-center text-[10px] font-medium text-ink-500">{format(bar.value)}</span>
                <div
                  className={`w-full rounded-t-md ${bar.color}`}
                  style={{ height: `${Math.max(bar.value > 0 ? 3 : 0, (bar.value / max) * 78)}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {data.map((item) => (
          <span key={item.label} className="min-w-0 flex-1 truncate text-center text-[12px] font-medium text-ink-600">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Linha com o eixo do zero destacado: acima é lucro, abaixo é prejuízo.
export function LineChart({
  points,
  marker,
  vline,
  xLabel,
  format = (value: number) => formatBrl(value, 0),
}: {
  points: { x: number; y: number }[];
  marker?: { x: number; y: number; label: string };
  vline?: { x: number; label: string };
  xLabel: string;
  format?: (value: number) => string;
}) {
  const width = 640;
  const height = 240;
  const pad = { top: 16, right: 16, bottom: 34, left: 64 };
  if (points.length < 2) return null;

  const xs = points.map((point) => point.x);
  const ys = [...points.map((point) => point.y), 0, ...(marker ? [marker.y] : [])];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanY = maxY - minY || 1;
  const sx = (x: number) => pad.left + ((x - minX) / (maxX - minX || 1)) * (width - pad.left - pad.right);
  const sy = (y: number) => pad.top + (1 - (y - minY) / spanY) * (height - pad.top - pad.bottom);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`)
    .join(' ');
  const zeroY = sy(0);
  const ticks = [minY, minY + spanY / 2, maxY];
  const area = `${path} L${sx(points[points.length - 1].x)},${zeroY} L${sx(points[0].x)},${zeroY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gráfico de linha do resultado">
      <defs>
        <clipPath id="line-clip-pos">
          <rect x={0} y={0} width={width} height={zeroY} />
        </clipPath>
        <clipPath id="line-clip-neg">
          <rect x={0} y={zeroY} width={width} height={Math.max(0, height - zeroY)} />
        </clipPath>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={sy(tick)} y2={sy(tick)} className="stroke-ink-100" />
          <text x={pad.left - 8} y={sy(tick) + 4} textAnchor="end" className="fill-ink-400 text-[11px]">
            {format(tick)}
          </text>
        </g>
      ))}
      <path d={area} clipPath="url(#line-clip-pos)" className="fill-success/15" />
      <path d={area} clipPath="url(#line-clip-neg)" className="fill-danger/15" />
      <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} className="stroke-ink-400" strokeDasharray="4 4" />
      <path d={path} fill="none" className="stroke-primary-500" strokeWidth={2.5} strokeLinejoin="round" />
      {vline && (
        <g>
          <line x1={sx(vline.x)} x2={sx(vline.x)} y1={pad.top} y2={height - pad.bottom} className="stroke-ink-300" strokeDasharray="3 3" />
          <text x={sx(vline.x)} y={height - pad.bottom + 14} textAnchor="middle" className="fill-ink-500 text-[11px]">
            {vline.label}
          </text>
        </g>
      )}
      {marker && (
        <g>
          <circle cx={sx(marker.x)} cy={sy(marker.y)} r={6} className="fill-white stroke-primary-600" strokeWidth={3} />
          <text x={sx(marker.x)} y={sy(marker.y) - 12} textAnchor="middle" className="fill-ink-900 text-[11px] font-semibold">
            {marker.label}
          </text>
        </g>
      )}
      <text x={(pad.left + width - pad.right) / 2} y={height - 4} textAnchor="middle" className="fill-ink-400 text-[11px]">
        {xLabel}
      </text>
    </svg>
  );
}
