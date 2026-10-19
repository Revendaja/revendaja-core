'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStoreStats, setStoreOnline } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import { Icon, type IconName } from '../icons';
import { Card, CardHeader } from './ui';
import { storeUrl } from '@/lib/storefront/domain';

export function StorefrontCard() {
  const { store, applyStore } = useAuth();
  const [copied, setCopied] = useState(false);
  const statsQuery = useQuery({ queryKey: queryKeys.storeStats(), queryFn: getStoreStats });

  const toggleMutation = useMutation({
    mutationFn: (isOnline: boolean) => setStoreOnline(isOnline),
    onSuccess: (updated) => applyStore(updated),
  });

  if (!store) return null;

  const displayLink = storeUrl(store.handle).replace(/^https?:\/\//, '');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(storeUrl(store!.handle));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o link continua visível no cartão.
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Minha vitrine"
        right={
          <button
            type="button"
            role="switch"
            aria-checked={store.isOnline}
            onClick={() => toggleMutation.mutate(!store.isOnline)}
            disabled={toggleMutation.isPending}
            className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
              store.isOnline
                ? 'border-success/30 bg-success-soft text-success'
                : 'border-ink-200 bg-ink-50 text-ink-500'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${store.isOnline ? 'bg-success' : 'bg-ink-300'}`} />
            {store.isOnline ? 'Online' : 'Offline'}
          </button>
        }
      />

      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
          <Icon name="store" size={20} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold text-ink-900">{store.storeName}</p>
          <p className="truncate text-xs text-ink-400">@{store.handle}</p>
        </div>
      </div>

      <div className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-ink-100 bg-ink-50 pl-3 pr-1">
        <Icon name="globe" size={15} className="text-ink-400" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-800">{displayLink}</span>
        <button
          type="button"
          onClick={() => void copyLink()}
          aria-label="Copiar link"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition hover:bg-white hover:text-primary-500"
        >
          <Icon name={copied ? 'sparkle' : 'copy'} size={15} />
        </button>
      </div>
      {toggleMutation.isError && (
        <p className="mt-2 text-[11px] font-medium text-danger">{getErrorMessage(toggleMutation.error)}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="h-9 rounded-lg bg-primary-500 text-xs font-semibold text-white transition hover:bg-primary-600"
        >
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
        <a
          href={storeUrl(store.handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center justify-center rounded-lg bg-ink-50 text-xs font-semibold text-ink-800 transition hover:bg-ink-100"
        >
          Abrir vitrine
        </a>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat icon="eye" label="Visitas (7 dias)" value={statsQuery.data?.visitsLast7Days} />
        <Stat icon="cart" label="Pedidos online" value={statsQuery.data?.ordersCount} />
      </div>

      <Link
        href="/loja/editar"
        className="mt-auto flex items-center justify-between pt-4 text-xs font-semibold text-primary-600 hover:underline"
      >
        <span className="flex items-center gap-1.5">
          <Icon name="edit" size={14} />
          Editar loja
        </span>
        <Icon name="chevronDown" size={14} className="-rotate-90" />
      </Link>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-ink-100 p-3">
      <div className="flex items-center justify-between text-ink-400">
        <span className="text-[11px]">{label}</span>
        <Icon name={icon} size={14} />
      </div>
      <p className="mt-1 text-xl font-semibold leading-none text-ink-900">{value ?? '—'}</p>
    </div>
  );
}
