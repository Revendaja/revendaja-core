'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getSalesSummary,
  getStaleProducts,
  getTopBrandsInRange,
  getTopProducts,
} from '@/lib/api/sales';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import { formatCurrency } from '@/lib/utils/format';
import { formatDateShort, MONTHS, periodRange, roundMoney, type Period } from '@/lib/utils/sales';
import { Icon, type IconName } from '@/components/dashboard/icons';
import { BalanceCard } from '@/components/dashboard/overview/BalanceCard';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';

const STALE_DAYS = 30;
const TOP_BRANDS_LIMIT = 5;
const TOP_PRODUCTS_LIMIT = 10;
const STALE_LIMIT = 10;

export default function ReportsPage() {
  const today = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<Period>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => today.getMonth());

  const range = useMemo(() => periodRange(period, selectedMonth, today), [period, selectedMonth, today]);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const periodParams = { from: fromIso, to: toIso };

  const summaryQuery = useQuery({
    queryKey: queryKeys.salesSummary(periodParams),
    queryFn: () => getSalesSummary(periodParams),
  });
  const brandsQuery = useQuery({
    queryKey: queryKeys.salesTopBrandsRange({ ...periodParams, limit: TOP_BRANDS_LIMIT }),
    queryFn: () => getTopBrandsInRange(periodParams, TOP_BRANDS_LIMIT),
  });
  const productsQuery = useQuery({
    queryKey: queryKeys.salesTopProducts({ ...periodParams, limit: TOP_PRODUCTS_LIMIT }),
    queryFn: () => getTopProducts(periodParams, TOP_PRODUCTS_LIMIT),
  });
  const staleQuery = useQuery({
    queryKey: queryKeys.salesStaleProducts(STALE_DAYS),
    queryFn: () => getStaleProducts(STALE_DAYS, STALE_LIMIT),
  });

  const summary = summaryQuery.data;
  const received = summary ? roundMoney(summary.grossRevenue - summary.pendingTotal) : null;
  const profitLabel =
    summary && summary.profit !== null
      ? `${formatCurrency(summary.profit)}${summary.marginPercent !== null ? ` · ${Math.round(summary.marginPercent)}%` : ''}`
      : null;

  return (
    <div className="flex w-full flex-col gap-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <Icon name="chart" size={20} />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-ink-900">Relatórios</h1>
            <p className="text-xs text-ink-400">Como sua loja está vendendo</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-ink-100 p-1">
            {(['week', 'month', 'year'] as const).map((key) => {
              const active = key === period;
              const label =
                key === 'week' ? 'Últimos 7 dias' : key === 'month' ? 'Mês' : `Ano ${today.getFullYear()}`;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  aria-pressed={active}
                  className={`h-9 rounded-lg px-3.5 text-xs font-semibold transition ${
                    active ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {period === 'month' && (
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              aria-label="Mês"
              className="h-9 rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 outline-none transition focus:border-primary-500"
            >
              {MONTHS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {summaryQuery.isError ? (
        <ErrorBox message={getErrorMessage(summaryQuery.error)} onRetry={() => void summaryQuery.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon="chart"
            label="Total vendido"
            value={summary ? formatCurrency(summary.grossRevenue) : null}
            hint="Vendas pagas e a receber"
          />
          <Kpi
            icon="cash"
            label="Recebido"
            value={received !== null ? formatCurrency(received) : null}
            tone="success"
            hint="Vendas já pagas"
          />
          <Kpi
            icon="receipt"
            label="A receber"
            value={summary ? formatCurrency(summary.pendingTotal) : null}
            tone="warning"
            hint="Vendas pendentes"
          />
          <Kpi
            icon="chartLine"
            label="Lucro"
            value={summary ? (profitLabel ?? '—') : null}
            tone={summary && summary.profit !== null && summary.profit < 0 ? 'danger' : 'neutral'}
            hint={
              summary && summary.profit === null
                ? 'Informe o preço de custo dos produtos'
                : summary?.profitIsPartial
                  ? 'Só produtos com custo cadastrado'
                  : 'Margem sobre o valor vendido'
            }
          />
        </div>
      )}

      <BalanceCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Marcas mais vendidas" right={<Icon name="star" size={15} className="text-ink-400" />} />
          <p className="mt-0.5 text-[11px] text-ink-400">{periodLabel(period, selectedMonth, today)}</p>
          <RankList
            state={brandsQuery}
            empty="Nenhuma venda de marca neste período."
            rows={brandsQuery.data?.items.map((brand) => ({
              key: String(brand.brandId),
              name: brand.name,
              image: brand.logo,
              fallback: brand.name.charAt(0).toUpperCase(),
              quantity: brand.quantitySold,
              revenue: brand.revenue,
            }))}
          />
        </Card>

        <Card>
          <CardHeader title="Produtos mais vendidos" right={<Icon name="box" size={15} className="text-ink-400" />} />
          <p className="mt-0.5 text-[11px] text-ink-400">{periodLabel(period, selectedMonth, today)}</p>
          <RankList
            state={productsQuery}
            empty="Nenhuma venda paga neste período."
            rows={productsQuery.data?.items.map((product) => ({
              key: product.storeProductId,
              name: product.name,
              image: product.image,
              fallback: null,
              quantity: product.quantitySold,
              revenue: product.revenue,
            }))}
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Produtos parados" right={<Icon name="bell" size={15} className="text-ink-400" />} />
        <p className="mt-0.5 text-[11px] text-ink-400">
          Têm estoque e não venderam nos últimos {STALE_DAYS} dias — bons candidatos a uma promoção.
        </p>

        <div className="mt-3 flex flex-col gap-2.5">
          {staleQuery.isPending && <SkeletonRows count={3} />}
          {staleQuery.isError && (
            <ErrorBox message={getErrorMessage(staleQuery.error)} onRetry={() => void staleQuery.refetch()} />
          )}
          {staleQuery.data?.items.length === 0 && (
            <p className="py-6 text-center text-xs text-ink-400">Nenhum produto parado — tudo girando bem!</p>
          )}
          {staleQuery.data?.items.map((item) => (
            <div key={item.storeProductId} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
              <Thumb image={item.image} fallback={null} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold text-ink-900">{item.name}</p>
                <p className="mt-0.5 text-[11px] text-warning">
                  {item.lastSoldAt ? `Última venda em ${formatDateShort(item.lastSoldAt)}` : 'Nunca vendido'}
                </p>
              </div>
              <div className="text-right leading-tight">
                <p className="text-[13px] font-semibold text-ink-900">{formatCurrency(item.price)}</p>
                <p className="mt-0.5 text-[11px] text-ink-400">{item.stock} em estoque</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function periodLabel(period: Period, month: number, now: Date) {
  if (period === 'week') return 'Últimos 7 dias';
  if (period === 'month') return `${MONTHS[month]} de ${now.getFullYear()}`;
  return `Ano ${now.getFullYear()}`;
}

const KPI_TONE = {
  neutral: 'text-ink-900',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: IconName;
  label: string;
  value: string | null;
  hint?: string;
  tone?: keyof typeof KPI_TONE;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 text-ink-400">
        <Icon name={icon} size={15} />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      {value === null ? (
        <div className="mt-2 h-7 w-32 animate-pulse rounded-lg bg-ink-100" />
      ) : (
        <p className={`mt-1.5 text-xl font-extrabold tracking-tight ${KPI_TONE[tone]}`}>{value}</p>
      )}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </Card>
  );
}

type RankRow = {
  key: string;
  name: string;
  image: string | null;
  fallback: string | null;
  quantity: number;
  revenue: number;
};

// Lista ranqueada com barra proporcional à quantidade vendida do 1º colocado.
function RankList({
  state,
  rows,
  empty,
}: {
  state: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  rows: RankRow[] | undefined;
  empty: string;
}) {
  const max = Math.max(1, ...(rows ?? []).map((row) => row.quantity));

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {state.isPending && <SkeletonRows count={4} />}
      {state.isError && (
        <ErrorBox message={getErrorMessage(state.error)} onRetry={() => void state.refetch()} />
      )}
      {rows?.length === 0 && <p className="py-6 text-center text-xs text-ink-400">{empty}</p>}
      {rows?.map((row, index) => (
        <div key={row.key} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
          <span className="w-5 shrink-0 text-center text-[11px] font-semibold text-ink-300">{index + 1}º</span>
          <Thumb image={row.image} fallback={row.fallback} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-[13px] font-semibold text-ink-900">{row.name}</p>
              <p className="shrink-0 text-[13px] font-semibold text-success">{formatCurrency(row.revenue)}</p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-50">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${Math.max(4, (row.quantity / max) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-ink-400">
              {row.quantity === 1 ? '1 unidade' : `${row.quantity} unidades`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Thumb({ image, fallback }: { image: string | null; fallback: string | null }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50 text-sm font-semibold text-primary-500">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full bg-white object-contain" />
      ) : fallback ? (
        fallback
      ) : (
        <Icon name="box" size={16} />
      )}
    </span>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, key) => (
        <div key={key} className="h-[64px] animate-pulse rounded-xl bg-ink-50" />
      ))}
    </>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white py-5 text-center">
      <p className="mb-3 text-xs font-medium text-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
      >
        Tentar novamente
      </button>
    </div>
  );
}
