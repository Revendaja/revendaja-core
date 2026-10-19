'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getSalesSummary, listSales, SALES_PAGE_SIZE } from '@/lib/api/sales';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { SaleStatusValue } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils/format';
import {
  formatDateShort,
  formatDayLabel,
  groupSalesByDay,
  MONTHS,
  PAYMENT_ICON,
  paymentLabel,
  periodRange,
  STATUS_LABEL,
  type Period,
} from '@/lib/utils/sales';
import { Icon, type IconName } from '@/components/dashboard/icons';

type StatusFilter = SaleStatusValue | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendente' },
  { key: 'paid', label: 'Pago' },
  { key: 'cancelled', label: 'Cancelado' },
];

const STATUS_TEXT_COLOR: Record<SaleStatusValue, string> = {
  paid: 'text-success',
  pending: 'text-warning',
  cancelled: 'text-ink-400',
};

export default function OnlineSalesPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  // Abre nos pendentes: é o que a lojista precisa atender (confirmar o pagamento ou cancelar).
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const today = useMemo(() => new Date(), []);

  const range = useMemo(() => periodRange(period, selectedMonth, today), [period, selectedMonth, today]);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  // Resumo só dos pedidos da vitrine (`source = online`) no período.
  const summaryQuery = useQuery({
    queryKey: queryKeys.salesSummary({ from: fromIso, to: toIso, source: 'online' }),
    queryFn: () => getSalesSummary({ from: fromIso, to: toIso, source: 'online' }),
  });
  const summary = summaryQuery.data;
  const received = summary ? Math.round((summary.grossRevenue - summary.pendingTotal) * 100) / 100 : null;

  const listParams = {
    from: fromIso,
    to: toIso,
    source: 'online' as const,
    status: filter === 'all' ? undefined : filter,
  };
  const listQuery = useInfiniteQuery({
    queryKey: queryKeys.salesList(listParams),
    queryFn: ({ pageParam }) => listSales(pageParam, { ...listParams, pageSize: SALES_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery;
  const pages = listQuery.data?.pages;
  const items = useMemo(() => pages?.flatMap((page) => page.items) ?? [], [pages]);
  const sections = useMemo(() => groupSalesByDay(items), [items]);
  const status = listQuery.isPending ? 'loading' : listQuery.isError ? 'error' : 'ready';

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  return (
    <div className="w-full pb-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/loja"
            aria-label="Voltar"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition hover:bg-ink-50"
          >
            <Icon name="chevronDown" size={18} className="rotate-90" />
          </Link>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-ink-900">Vendas online</h1>
            <p className="text-xs text-ink-400">Pedidos que suas clientes fizeram pela vitrine</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-ink-100 p-1">
          {(['week', 'month', 'year'] as const).map((key) => {
            const active = key === period;
            const label = key === 'week' ? 'Últimos 7 dias' : key === 'month' ? 'Mês' : `Ano ${today.getFullYear()}`;
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

      {summaryQuery.isError ? (
        <div className="mb-5 rounded-2xl border border-ink-100 bg-white p-5 text-center">
          <p className="mb-3 text-xs font-medium text-danger">{getErrorMessage(summaryQuery.error)}</p>
          <button
            type="button"
            onClick={() => void summaryQuery.refetch()}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <SummaryTile
            icon="globe"
            label="Vendido pela vitrine"
            value={summary ? formatCurrency(summary.grossRevenue) : null}
            loading={summaryQuery.isPending}
            tone="neutral"
          />
          <SummaryTile
            icon="cash"
            label="Recebido"
            value={received !== null ? formatCurrency(received) : null}
            loading={summaryQuery.isPending}
            tone="success"
          />
          <SummaryTile
            icon="bell"
            label="A receber"
            value={summary ? formatCurrency(summary.pendingTotal) : null}
            hint="Pedidos aguardando confirmação"
            loading={summaryQuery.isPending}
            tone="warning"
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`h-9 rounded-full px-3.5 text-xs font-semibold transition ${
              filter === key ? 'bg-primary-500 text-white' : 'border border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-16 animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl border border-ink-100 p-10 text-center">
          <p className="mb-3 text-sm font-medium text-danger">{getErrorMessage(listQuery.error)}</p>
          <button
            type="button"
            onClick={() => void listQuery.refetch()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {status === 'ready' && sections.length === 0 && (
        <div className="animate-fade-up flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
            <Icon name="globe" size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold text-ink-900">Nenhum pedido online encontrado</p>
          <p className="mt-1 max-w-sm text-xs text-ink-400">
            {filter === 'all'
              ? 'Compartilhe o link da sua vitrine para começar a receber pedidos.'
              : 'Nenhum pedido com esse status no período. Ajuste o filtro ou o período.'}
          </p>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.key} className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase text-ink-500">{formatDayLabel(section.key, today)}</p>
            <p className="text-xs font-bold text-ink-900">{formatCurrency(section.total)}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {section.data.map((sale) => {
              const color = STATUS_TEXT_COLOR[sale.status];
              return (
                <Link
                  key={sale.id}
                  href={`/vendas/${sale.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 transition hover:border-ink-200"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
                    <Icon name={PAYMENT_ICON[sale.paymentMethod]} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-900">{sale.customerName}</span>
                    <span className="block truncate text-xs text-ink-400">
                      {paymentLabel(sale.paymentMethod, sale.installments)}
                      {sale.fulfillment && ` · ${sale.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}`} ·{' '}
                      {formatDateShort(sale.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-sm font-extrabold ${color}`}>
                      {sale.status === 'paid' ? '+' : ''}
                      {formatCurrency(sale.total)}
                    </span>
                    <span className={`block text-[11px] font-semibold ${color}`}>{STATUS_LABEL[sale.status]}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div ref={sentinelRef} className="mt-2 flex min-h-8 items-center justify-center text-xs text-ink-400">
        {isFetchingNextPage && 'Carregando mais pedidos...'}
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
  loading,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  hint?: string;
  loading: boolean;
  tone: 'success' | 'warning' | 'neutral';
}) {
  const toneClass = { success: 'text-success', warning: 'text-warning', neutral: 'text-ink-900' }[tone];

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
          <Icon name={icon} size={15} />
        </span>
        <span className="text-xs text-ink-500">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-24 animate-pulse rounded bg-ink-100" />
      ) : (
        <p className={`text-xl font-extrabold ${toneClass}`}>{value ?? '—'}</p>
      )}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}
