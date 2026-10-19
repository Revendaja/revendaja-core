'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStorePlan, getStoreStats, setStoreOnline } from '@/lib/api/stores';
import { listSales } from '@/lib/api/sales';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import { formatDateFull } from '@/lib/utils/sales';
import { Icon, type IconName } from '@/components/dashboard/icons';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';
import { storeUrl } from '@/lib/storefront/domain';

export default function MyStorePage() {
  const { store, applyStore } = useAuth();
  const [copied, setCopied] = useState(false);

  const statsQuery = useQuery({ queryKey: queryKeys.storeStats(), queryFn: getStoreStats });
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  // Pedidos feitos pelos clientes na vitrine que ainda esperam pagamento/confirmação.
  const pendingParams = { source: 'online', status: 'pending' } as const;
  const pendingQuery = useQuery({
    queryKey: queryKeys.salesList({ ...pendingParams, pageSize: 1 }),
    queryFn: () => listSales(1, { ...pendingParams, pageSize: 1 }),
  });

  const toggleMutation = useMutation({
    mutationFn: (isOnline: boolean) => setStoreOnline(isOnline),
    onSuccess: (updated) => applyStore(updated),
  });

  if (!store) return null;

  const displayLink = storeUrl(store.handle).replace(/^https?:\/\//, '');
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(`Confira minha loja ${store.storeName}: ${storeUrl(store.handle)}`)}`;
  const plan = planQuery.data;
  const productsUsed = plan?.usage.products;
  const maxProducts = plan?.limits.maxProducts ?? null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(storeUrl(store!.handle));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o link continua visível na tela.
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <Icon name="store" size={20} />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-ink-900">Minha loja</h1>
            <p className="text-xs text-ink-400">Sua vitrine virtual e os pedidos que chegam por ela</p>
          </div>
        </div>

        <Link
          href="/loja/editar"
          className="flex h-9 items-center gap-1.5 rounded-lg bg-primary-500 px-4 text-xs font-semibold text-white transition hover:bg-primary-600"
        >
          <Icon name="edit" size={15} />
          Editar loja
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              store.isOnline ? 'bg-success-soft text-success' : 'bg-ink-50 text-ink-400'
            }`}
          >
            <Icon name="globe" size={22} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-ink-900">
                {store.isOnline ? 'Loja online ativa' : 'Loja offline'}
              </p>
              {store.isOnline && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {store.isOnline
                ? 'Suas clientes podem ver os produtos e fazer pedidos 24h por dia.'
                : 'A vitrine está fora do ar. Ative para voltar a receber pedidos.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={store.isOnline}
            aria-label="Loja online"
            onClick={() => toggleMutation.mutate(!store.isOnline)}
            disabled={toggleMutation.isPending}
            className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
              store.isOnline ? 'bg-success' : 'bg-ink-200'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                store.isOnline ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        {toggleMutation.isError && (
          <p className="mt-3 text-xs font-medium text-danger">{getErrorMessage(toggleMutation.error)}</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Link da vitrine" />

          <div className="mt-4 leading-tight">
            <p className="text-xs text-ink-400">{store.storeName}</p>
            <p className="text-lg font-semibold text-ink-900">@{store.handle}</p>
            {store.bio && <p className="mt-2 text-xs text-ink-500">{store.bio}</p>}
          </div>

          <div className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-ink-100 bg-ink-50 pl-3 pr-1">
            <Icon name="globe" size={15} className="text-ink-400" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-800">{displayLink}</span>
            <button
              type="button"
              onClick={() => void copyLink()}
              aria-label="Copiar link"
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-primary-600 transition hover:bg-white"
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href={storeUrl(store.handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink-50 text-xs font-semibold text-ink-800 transition hover:bg-ink-100"
            >
              <Icon name="eye" size={15} />
              Ver como cliente
            </a>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-success text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Icon name="externalLink" size={15} />
              Compartilhar no WhatsApp
            </a>
          </div>

          <p className="mt-4 text-[11px] text-ink-400">Loja criada em {formatDateFull(store.createdAt)}</p>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <Stat
            icon="eye"
            label="Visitas (7 dias)"
            value={statsQuery.data?.visitsLast7Days}
            loading={statsQuery.isPending}
          />
          <Stat
            icon="cart"
            label="Pedidos feitos"
            value={statsQuery.data?.ordersCount}
            loading={statsQuery.isPending}
          />
          <Stat
            icon="bell"
            label="Pedidos aguardando"
            value={pendingQuery.data?.total}
            loading={pendingQuery.isPending}
            tone="warning"
            href="/loja/vendas-online"
          />
          <Stat
            icon="box"
            label={maxProducts === null ? 'Produtos na loja' : `Produtos (limite ${maxProducts})`}
            value={productsUsed}
            loading={planQuery.isPending}
            href="/produtos"
          />
        </div>
      </div>

      {(statsQuery.isError || planQuery.isError || pendingQuery.isError) && (
        <p className="text-xs font-medium text-danger">
          Não foi possível carregar alguns números.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void statsQuery.refetch();
              void planQuery.refetch();
              void pendingQuery.refetch();
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Shortcut href="/loja/editar" icon="edit" title="Editar loja" text="Nome, link e descrição da vitrine" />
        <Shortcut href="/loja/vendas-online" icon="cart" title="Vendas online" text="Pedidos feitos pelos clientes" />
        <Shortcut href="/produtos" icon="box" title="Meus produtos" text="Preços, estoque e o que aparece na vitrine" />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  loading,
  tone = 'neutral',
  href,
}: {
  icon: IconName;
  label: string;
  value: number | undefined;
  loading: boolean;
  tone?: 'neutral' | 'warning';
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-ink-400">
        <span className="text-[11px] font-semibold">{label}</span>
        <Icon name={icon} size={14} />
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-14 animate-pulse rounded-lg bg-ink-100" />
      ) : (
        <p
          className={`mt-1.5 text-2xl font-extrabold leading-none ${
            tone === 'warning' && value ? 'text-warning' : 'text-ink-900'
          }`}
        >
          {value === undefined ? '—' : value.toLocaleString('pt-BR')}
        </p>
      )}
    </>
  );
  const className = 'rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]';
  return href ? (
    <Link href={href} className={`${className} transition hover:border-primary-200`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Shortcut({ href, icon, title, text }: { href: string; icon: IconName; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-primary-200"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13px] font-semibold text-ink-900">{title}</span>
        <span className="mt-0.5 block text-[11px] text-ink-400">{text}</span>
      </span>
      <Icon name="chevronDown" size={14} className="-rotate-90 text-ink-300" />
    </Link>
  );
}
