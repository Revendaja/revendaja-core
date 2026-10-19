'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listStoreProducts } from '@/lib/api/storeProducts';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { StoreProduct } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils/format';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Icon } from '@/components/dashboard/icons';

// Escolhe, entre os produtos que já estão na loja, quais compõem o kit. Não mostra kits (produto que já
// tem componentes): evita kit-dentro-de-kit.
export function ComponentPicker({
  excludeIds,
  onSelect,
  onClose,
}: {
  excludeIds: ReadonlySet<string>;
  onSelect: (item: StoreProduct) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query.trim(), 400);
  const productsQuery = useQuery({
    queryKey: queryKeys.storeProducts({ picker: true, term }),
    queryFn: () => listStoreProducts(1, { search: term || undefined, pageSize: 50 }),
  });
  const candidates = (productsQuery.data?.items ?? []).filter(
    (item) => !excludeIds.has(item.id) && item.components.length === 0,
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Adicionar produto ao kit"
        className="animate-fade-up flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 pb-2">
          <h3 className="text-sm font-semibold text-ink-900">Adicionar produto</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="px-4 pb-3">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-ink-200 px-3 focus-within:border-primary-500">
            <Icon name="search" size={16} className="text-ink-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome..."
              aria-label="Buscar produto do estoque"
              autoFocus
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
          </label>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto px-4 pb-4">
          {productsQuery.isPending && <p className="py-10 text-center text-xs text-ink-400">Carregando...</p>}
          {productsQuery.isError && (
            <p className="py-10 text-center text-xs font-medium text-danger">{getErrorMessage(productsQuery.error)}</p>
          )}
          {productsQuery.isSuccess && candidates.length === 0 && (
            <p className="py-10 text-center text-xs text-ink-400">Nenhum produto disponível para adicionar.</p>
          )}
          <ul className="flex flex-col gap-2">
            {candidates.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-label={`Adicionar ${item.product.name}`}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-2.5 text-left transition hover:border-primary-200 hover:bg-primary-50/30"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                    {item.product.productImageSm ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.product.productImageSm} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="box" size={18} className="text-primary-500" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">{item.product.name}</span>
                    <span className="block text-xs text-ink-400">
                      {item.stock} em estoque · {formatCurrency(item.price)}
                    </span>
                  </span>
                  <Icon name="plus" size={18} className="shrink-0 text-primary-500" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
