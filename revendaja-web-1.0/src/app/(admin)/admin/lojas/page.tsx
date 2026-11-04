'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAdminStores, type AdminPlanId, type AdminStoreSort } from '@/lib/api/admin';
import { getErrorMessage } from '@/lib/api/errors';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatWhatsapp, whatsappUrl } from '@/lib/utils/format';
import { PLAN_IDS, PLAN_LABELS } from '@/lib/admin/costModel';
import { Card } from '@/components/dashboard/overview/ui';
import {
  Badge,
  PageHeader,
  PlanBadge,
  QueryState,
  SubscriptionBadge,
  Table,
  daysSince,
  formatBrl,
  formatCompact,
  formatDay,
  formatInt,
} from '@/components/admin/ui';

const PAGE_SIZE = 25;

const SORTS: { value: AdminStoreSort; label: string }[] = [
  { value: 'created', label: 'Mais recentes' },
  { value: 'gmv', label: 'Quem mais vendeu (30 dias)' },
  { value: 'lastSale', label: 'Venda mais recente' },
  { value: 'ai', label: 'Quem mais usa a IA' },
];

function lastSaleLabel(iso: string | null) {
  const days = daysSince(iso);
  if (days === null) return <span className="text-ink-400">nunca vendeu</span>;
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return <span className={days > 30 ? 'text-warning' : undefined}>há {days} dias</span>;
}

const selectClass =
  'h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] text-ink-800 outline-none focus:border-primary-500';

export default function AdminStoresPage() {
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<AdminPlanId | ''>('');
  const [sort, setSort] = useState<AdminStoreSort>('created');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());

  const params = { search: debouncedSearch || undefined, plan: plan || undefined, sort, page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: ['admin', 'stores', params],
    queryFn: () => getAdminStores(params),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Lojas e clientes"
        subtitle="Quem são suas clientes, em que plano estão, se estão vendendo e quanto usam a IA."
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Buscar por loja, nome ou e-mail"
          className="h-9 w-full max-w-xs rounded-lg border border-ink-200 bg-white px-3 text-[13px] outline-none focus:border-primary-500"
        />
        <select
          aria-label="Filtrar por plano"
          className={selectClass}
          value={plan}
          onChange={(event) => {
            setPlan(event.target.value as AdminPlanId | '');
            setPage(1);
          }}
        >
          <option value="">Todos os planos</option>
          {PLAN_IDS.map((id) => (
            <option key={id} value={id}>
              {PLAN_LABELS[id]}
            </option>
          ))}
        </select>
        <select
          aria-label="Ordenar"
          className={selectClass}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as AdminStoreSort);
            setPage(1);
          }}
        >
          {SORTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[13px] text-ink-500">{formatInt(total)} loja(s)</span>
      </div>

      <QueryState
        loading={query.isLoading}
        error={query.error ? getErrorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
      />

      {query.data && (
        <Card className="p-0">
          <Table head={['Loja', 'Dona', 'Plano', 'Assinatura', 'Produtos', 'Vendas 30d', 'Faturou 30d', 'Última venda', 'IA no mês', 'Cadastro']}>
            {query.data.items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-ink-400">
                  Nenhuma loja encontrada.
                </td>
              </tr>
            )}
            {query.data.items.map((store) => (
              <tr key={store.id} className="align-top hover:bg-ink-50/60">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-ink-900">{store.storeName}</p>
                  <p className="text-[12px] text-ink-400">
                    {store.handle} {!store.isOnline && <Badge>vitrine desligada</Badge>}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-ink-800">{store.ownerName}</p>
                  <p className="text-[12px] text-ink-400">{store.ownerEmail}</p>
                  {store.ownerWhatsapp && (
                    <a
                      href={whatsappUrl(store.ownerWhatsapp)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] font-medium text-primary-600 hover:underline"
                    >
                      {formatWhatsapp(store.ownerWhatsapp)}
                    </a>
                  )}
                  {!store.verified && <p className="mt-0.5"><Badge tone="warn">e-mail não verificado</Badge></p>}
                </td>
                <td className="px-3 py-2.5">
                  <PlanBadge plan={store.plan} />
                </td>
                <td className="px-3 py-2.5">
                  <SubscriptionBadge status={store.subscriptionStatus} cancelAtPeriodEnd={store.cancelAtPeriodEnd} />
                  {store.currentPeriodEnd && (
                    <p className="mt-0.5 text-[11px] text-ink-400">renova {formatDay(store.currentPeriodEnd)}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-800">{formatInt(store.products)}</td>
                <td className="px-3 py-2.5 text-ink-800">{formatInt(store.sales30d)}</td>
                <td className="px-3 py-2.5 font-medium text-ink-900">{formatBrl(store.gmv30d, 0)}</td>
                <td className="px-3 py-2.5 text-ink-800">{lastSaleLabel(store.lastSaleAt)}</td>
                <td className="px-3 py-2.5 text-ink-800">
                  {store.aiMessages > 0 ? (
                    <>
                      {formatInt(store.aiMessages)} msg
                      <span className="block text-[11px] text-ink-400">{formatCompact(store.aiTokens)} tokens</span>
                    </>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-500">{formatDay(store.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-[13px]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-lg border border-ink-200 px-3 py-1.5 font-medium text-ink-700 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-ink-500">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-ink-200 px-3 py-1.5 font-medium text-ink-700 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
