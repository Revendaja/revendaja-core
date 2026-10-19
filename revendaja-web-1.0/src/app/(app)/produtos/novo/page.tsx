'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CATALOG_PAGE_SIZE, listBrands, listCatalogProducts } from '@/lib/api/catalog';
import { getStorePlan } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { CatalogProduct } from '@/lib/api/types';
import { formatCurrency, hasSuggestedPrice } from '@/lib/utils/format';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInStoreProducts } from '@/hooks/useInStoreProducts';
import { Icon } from '@/components/dashboard/icons';
import { PageHeader } from '@/components/products/FormParts';

export default function NewProductPage() {
  const [query, setQuery] = useState('');
  const [brandId, setBrandId] = useState<number | null>(null);
  // Só busca depois que a pessoa para de digitar. String vazia nunca vai para a API.
  const search = useDebouncedValue(query.trim(), 400);
  const isBarcodeSearch = /^\d{8,14}$/.test(search);

  const inStore = useInStoreProducts();
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  const manualBlocked = planQuery.data ? !planQuery.data.limits.manualProductsEnabled : false;

  // Marcas mudam raramente: reaproveita o cache pelo resto da sessão.
  const brandsQuery = useQuery({ queryKey: queryKeys.catalogBrands(), queryFn: listBrands, staleTime: Infinity });
  const brands = brandsQuery.data ?? [];

  const catalogQuery = useInfiniteQuery({
    queryKey: queryKeys.catalogProducts({ search, brandId }),
    queryFn: ({ pageParam }) => listCatalogProducts(pageParam, { search: search || undefined, brandId }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = catalogQuery;
  const items = catalogQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = catalogQuery.data?.pages[0]?.total ?? 0;

  // Rolagem infinita: quando o final da lista aparece na tela, carrega a próxima página.
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

  const chips: { id: number | null; name: string }[] = [{ id: null, name: 'Todas' }, ...brands];

  return (
    <div className="w-full">
      <PageHeader title="Novo produto" subtitle="Escolha do catálogo ou cadastre o seu" backHref="/produtos" />

      <Link
        href="/produtos/novo/manual"
        className="group mb-6 flex items-center gap-4 rounded-2xl border border-ink-100 p-4 transition hover:border-primary-200 hover:bg-primary-50/30"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
          <Icon name="edit" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            Cadastro manual
            {manualBlocked && (
              <span className="flex items-center gap-1 rounded-md bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                <Icon name="lock" size={10} />
                Não incluso no seu plano
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-ink-400">
            Crie um produto próprio (ex.: um ursinho ou uma cesta de presente)
          </span>
        </span>
        <Icon name="chevronDown" size={18} className="-rotate-90 text-ink-400 transition group-hover:text-primary-500" />
      </Link>

      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Escolha do catálogo</h2>
        {catalogQuery.isSuccess && (
          <span className="text-xs text-ink-400">{total.toLocaleString('pt-BR')} produtos</span>
        )}
      </div>

      <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 focus-within:border-primary-500 sm:max-w-lg">
        <Icon name="search" size={16} className="text-ink-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou código de barras..."
          aria-label="Buscar por nome ou código de barras"
          autoComplete="off"
          className="h-full w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="text-ink-300 transition hover:text-ink-600"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </label>

      {brandsQuery.isError ? (
        <button
          type="button"
          onClick={() => void brandsQuery.refetch()}
          className="mb-4 text-xs text-ink-400"
        >
          Não foi possível carregar as marcas. <span className="font-semibold text-primary-500">Tentar novamente</span>
        </button>
      ) : (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {chips.map((chip) => (
            <button
              key={String(chip.id)}
              type="button"
              onClick={() => setBrandId(chip.id)}
              aria-pressed={chip.id === brandId}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                chip.id === brandId
                  ? 'bg-primary-500 text-white'
                  : 'border border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
              }`}
            >
              {chip.name}
            </button>
          ))}
        </div>
      )}

      {catalogQuery.isPending && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="h-[84px] animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />
          ))}
        </div>
      )}

      {catalogQuery.isError && (
        <div className="rounded-2xl border border-ink-100 p-10 text-center">
          <p className="mb-3 text-sm font-medium text-danger">{getErrorMessage(catalogQuery.error)}</p>
          <button
            type="button"
            onClick={() => void catalogQuery.refetch()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {catalogQuery.isSuccess && items.length === 0 && (
        <div className="animate-fade-up flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
            <Icon name="search" size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold text-ink-900">Nenhum produto encontrado</p>
          <p className="mt-1 max-w-sm text-xs text-ink-400">
            {isBarcodeSearch
              ? `Nenhum produto do catálogo tem o código de barras ${search}.`
              : 'Tente outro nome, um código de barras ou outra marca.'}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((product, index) => (
            <CatalogRow
              key={product.id}
              product={product}
              storeProductId={inStore[product.id]}
              delay={Math.min(index % CATALOG_PAGE_SIZE, 8) * 30}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="mt-5 flex min-h-8 items-center justify-center pb-6 text-xs text-ink-400">
        {isFetchingNextPage && 'Carregando mais produtos...'}
        {!isFetchingNextPage && hasNextPage && items.length > 0 && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            className="rounded-lg border border-ink-200 px-4 py-2 font-medium text-ink-700 transition hover:bg-ink-50"
          >
            Carregar mais
          </button>
        )}
      </div>
    </div>
  );
}

function CatalogRow({
  product,
  storeProductId,
  delay,
}: {
  product: CatalogProduct;
  // Definido quando o produto já está na loja.
  storeProductId: string | undefined;
  delay: number;
}) {
  const inStore = storeProductId !== undefined;
  const href = inStore ? `/produtos/${storeProductId}` : `/produtos/novo/catalogo/${product.id}`;

  return (
    <Link
      href={href}
      aria-label={inStore ? `${product.name}, já está na sua loja` : product.name}
      className="animate-fade-up group flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 transition hover:border-primary-200 hover:shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50">
        {product.productImageSm ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.productImageSm} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="box" size={26} className="text-primary-500" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-bold uppercase text-primary-600">
          {product.brand.name}
          {/* ~30% dos produtos têm basePrice = 0: nesse caso não mostra "R$ 0,00". */}
          {hasSuggestedPrice(product.basePrice) && (
            <span className="font-semibold normal-case text-ink-400">{`  ·  ${formatCurrency(product.basePrice)}`}</span>
          )}
        </span>
        <span className="block truncate text-sm font-bold text-ink-900">{product.name}</span>
        {product.description && (
          <span className="mt-0.5 block truncate text-xs text-ink-400">{product.description}</span>
        )}
      </span>
      {inStore ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold text-success">
          <Icon name="check" size={11} strokeWidth={3} />
          Na loja
        </span>
      ) : (
        <Icon name="chevronDown" size={18} className="-rotate-90 shrink-0 text-ink-400 transition group-hover:text-primary-500" />
      )}
    </Link>
  );
}
