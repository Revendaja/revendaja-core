'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSalesTimeline } from '@/lib/api/sales';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { SalesTimeline, TimelineGroupBy } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, DotsButton, GrowthPill, Money } from './ui';

const PERIODS: { label: string; groupBy: TimelineGroupBy }[] = [
  { label: 'Dia', groupBy: 'day' },
  { label: 'Semana', groupBy: 'week' },
  { label: 'Mês', groupBy: 'month' },
];

const W = 800;
const H = 200;
const y = (value: number, max: number) => 170 - (max > 0 ? (value / max) * 100 : 0) * 1.4;

function labelFor(iso: string, groupBy: TimelineGroupBy) {
  const date = new Date(iso);
  if (groupBy === 'month') {
    const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return month.charAt(0).toUpperCase() + month.slice(1);
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Posição horizontal do centro de cada período, em um gráfico com `count` períodos.
const xAt = (index: number, count: number) => ((index + 0.5) / count) * W;

// Linha suave (Catmull-Rom -> Bézier, sem ultrapassar os pontos) por todos os períodos, de borda a
// borda do gráfico. Períodos futuros chegam com valor 0, então a linha desce até o fim do ano.
function smoothPath(values: number[], max: number) {
  const pts: [number, number][] = [
    [0, y(values[0], max)],
    ...values.map((v, i): [number, number] => [xAt(i, values.length), y(v, max)]),
    [W, y(values[values.length - 1], max)],
  ];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    // Os pontos de controle ficam entre a altura dos dois pontos do trecho: sem isso a curva
    // "passa" do ponto e afunda abaixo da linha de zero antes de subir.
    const low = Math.min(p1[1], p2[1]);
    const high = Math.max(p1[1], p2[1]);
    const clamp = (value: number) => Math.min(Math.max(value, low), high);
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${clamp(p1[1] + (p2[1] - p0[1]) / 6)}, ${p2[0] - (p3[0] - p1[0]) / 6} ${clamp(p2[1] - (p3[1] - p1[1]) / 6)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function BalanceCard() {
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>('month');
  const timelineQuery = useQuery({
    queryKey: queryKeys.salesTimeline(groupBy),
    queryFn: () => getSalesTimeline(groupBy),
  });

  return (
    <Card className="h-full">
      <CardHeader
        title="Saldo total"
        right={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-ink-100 bg-ink-50/70 p-0.5 text-xs">
              {PERIODS.map((period) => (
                <button
                  key={period.groupBy}
                  type="button"
                  onClick={() => setGroupBy(period.groupBy)}
                  className={`rounded-md px-3 py-1 transition ${
                    groupBy === period.groupBy
                      ? 'bg-white font-medium text-ink-900 shadow-sm ring-1 ring-ink-100'
                      : 'text-ink-300 hover:text-ink-500'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
            <DotsButton />
          </div>
        }
      />

      <div className="-mx-5 mt-4 border-t border-ink-100" />

      {timelineQuery.isPending && <BalanceSkeleton />}

      {timelineQuery.isError && (
        <div className="flex h-[260px] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium text-danger">{getErrorMessage(timelineQuery.error)}</p>
          <button
            type="button"
            onClick={() => void timelineQuery.refetch()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {timelineQuery.data && <BalanceChart timeline={timelineQuery.data} />}
    </Card>
  );
}

function BalanceChart({ timeline }: { timeline: SalesTimeline }) {
  const { items, groupBy } = timeline;
  const [hovered, setHovered] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  // Último período que já começou (na visão por mês, o mês atual; os seguintes ainda não ocorreram).
  let lastIndex = 0;
  items.forEach((item, index) => {
    if (new Date(item.periodStart).getTime() <= now) lastIndex = index;
  });

  const total = items.reduce((sum, item) => sum + item.revenue, 0);
  const last = items[lastIndex]?.revenue ?? 0;
  const previous = items[lastIndex - 1]?.revenue ?? 0;
  const growth = previous > 0 ? ((last - previous) / previous) * 100 : null;
  const empty = total === 0;

  const max = Math.max(1, ...items.map((item) => Math.max(item.revenue, item.cost)));
  const revenue = items.map((item) => item.revenue);
  const cost = items.map((item) => item.cost);
  const incomePath = smoothPath(revenue, max);
  const costPath = smoothPath(cost, max);

  // Sem hover, o balão fica no ponto de maior receita (como no layout de referência).
  const peak = revenue.indexOf(Math.max(...revenue));
  const active = hovered ?? peak;
  const xPct = ((active + 0.5) / items.length) * 100;
  const labelStep = Math.ceil(items.length / 12);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Money value={total} className="text-[36px] font-semibold leading-none tracking-tight text-ink-900" />
          {growth !== null && (
            <span title="Último período comparado ao anterior">
              <GrowthPill value={`${Math.abs(growth).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`} negative={growth < 0} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-700">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary-500" />
            Receita
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink-900" />
            Custo
          </span>
        </div>
      </div>

      <div className="relative mt-4 h-[180px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6b00" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ff6b00" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${incomePath} L ${W} ${H} L 0 ${H} Z`} fill="url(#balanceFill)" />
          <path d={costPath} fill="none" stroke="#1a1b25" strokeWidth="1.5" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          <path d={incomePath} fill="none" stroke="#ff6b00" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>

        {empty ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-400">
            Sem vendas pagas neste período.
          </p>
        ) : (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${xPct}%`, top: `${(y(revenue[active], max) / H) * 100}%` }}
          >
            <span className="block h-2.5 w-2.5 rounded-full bg-ink-900 ring-2 ring-white" />
            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md">
              {formatCurrency(revenue[active])}
            </span>
          </div>
        )}

        {/* Colunas invisíveis: passar o mouse move o balão para aquele período. */}
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          onMouseLeave={() => setHovered(null)}
        >
          {items.map((item, index) => (
            <span key={item.periodStart} onMouseEnter={() => setHovered(index)} />
          ))}
        </div>
      </div>

      <div
        className="mt-1 grid text-center text-[11px] text-ink-400"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item, index) => (
          <span key={item.periodStart} className="truncate">
            {index % labelStep === 0 ? labelFor(item.periodStart, groupBy) : ''}
          </span>
        ))}
      </div>

      {timeline.costIsPartial && (
        <p className="mt-3 text-[11px] text-ink-400">O custo considera só os produtos com custo cadastrado.</p>
      )}
    </>
  );
}

function BalanceSkeleton() {
  return (
    <div className="mt-4 animate-pulse">
      <div className="h-9 w-48 rounded-lg bg-ink-100" />
      <div className="mt-4 h-[180px] rounded-xl bg-ink-50" />
      <div className="mt-2 h-3 rounded bg-ink-50" />
    </div>
  );
}
