'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { STORE_PRODUCTS_PAGE_SIZE, listStoreProducts, updateStoreProduct } from '@/lib/api/storeProducts';
import { listStoreCategories } from '@/lib/api/storeCategories';
import { getStorePlan } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import type { Paginated, StoreProduct, StoreProductSort } from '@/lib/api/types';
import { STOCK_MAX, formatCurrency, hasSuggestedPrice } from '@/lib/utils/format';
import { useAuth } from '@/lib/auth/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStockStepper } from '@/hooks/useStockStepper';
import { Icon } from '@/components/dashboard/icons';
import { OverLimitBanner } from '@/components/billing/OverLimitBanner';
import { storeUrl } from '@/lib/storefront/domain';

type ProductsCache = InfiniteData<Paginated<StoreProduct>, number>;
type StatusFilter = 'all' | 'active' | 'hidden';

// Mesmo critério do app: até 20 unidades é "Estoque Baixo".
const LOW_STOCK_THRESHOLD = 20;

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Visíveis' },
  { key: 'hidden', label: 'Ocultos' },
];

const SORT_OPTIONS: { value: StoreProductSort; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'name_asc', label: 'Nome (A-Z)' },
  { value: 'name_desc', label: 'Nome (Z-A)' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'stock_asc', label: 'Menor estoque' },
];

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { store } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<StoreProductSort>('recent');
  const [categoryId, setCategoryId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Seleção em massa para compartilhar vários produtos de uma vez (como no app).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [autoSelectingAll, setAutoSelectingAll] = useState(false);
  const [copied, setCopied] = useState(false);

  // A busca é no servidor (nome ou código de barras); termo vazio = lista normal.
  const term = useDebouncedValue(query.trim(), 400);
  const isSearching = term.length > 0;
  const isBarcodeSearch = /^\d{8,14}$/.test(term);

  const listKey = queryKeys.storeProducts({ term, sort, categoryId });
  const productsQuery = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      listStoreProducts(pageParam, {
        search: term || undefined,
        categoryId: categoryId || undefined,
        sort,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = productsQuery;

  // Categorias e plano são opcionais para a tela: se falharem, a lista continua funcionando.
  const categoriesQuery = useQuery({ queryKey: queryKeys.storeCategories(), queryFn: listStoreCategories });
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  const categories = categoriesQuery.data?.items ?? [];
  const plan = planQuery.data;

  const loaded = productsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = productsQuery.data?.pages[0]?.total ?? 0;
  // Visíveis/Ocultos não existe na API: filtra só o que já foi carregado.
  const filtered = loaded.filter((item) => {
    if (filter === 'active') return item.isActive;
    if (filter === 'hidden') return !item.isActive;
    return true;
  });

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, filtered.length]);

  // "Selecionar todos" precisa dos produtos que ainda não carregaram: busca o resto, uma página por
  // vez, e só marca todos quando não sobrar nada para buscar.
  useEffect(() => {
    if (!autoSelectingAll) return;
    if (hasNextPage) {
      if (!isFetchingNextPage) void fetchNextPage();
      return;
    }
    setSelectedIds(new Set(filtered.map((item) => item.id)));
    setAutoSelectingAll(false);
  }, [autoSelectingAll, hasNextPage, isFetchingNextPage, fetchNextPage, filtered]);

  // Troca o produto atualizado em TODAS as listas em cache (busca, ordenação e categoria diferentes).
  function patchProduct(updated: StoreProduct) {
    queryClient.setQueriesData<ProductsCache>({ queryKey: queryKeys.allStoreProducts() }, (current) =>
      current && 'pages' in current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === updated.id ? updated : item)),
            })),
          }
        : current,
    );
  }

  function handleError(error: unknown) {
    setActionError(getErrorMessage(error));
    // 404: o produto já não existe mais na loja; atualiza a lista.
    if (error instanceof ApiError && error.status === 404) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() });
    }
  }

  const visibilityMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateStoreProduct(id, { isActive }),
    // Atualiza na hora; se o backend recusar, recarrega do servidor.
    onMutate: ({ id, isActive }) => {
      setActionError(null);
      const current = loaded.find((item) => item.id === id);
      if (current) patchProduct({ ...current, isActive });
    },
    onSuccess: (updated) => patchProduct(updated),
    onError: (error) => {
      handleError(error);
      void queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() });
    },
  });

  // --- Seleção -----------------------------------------------------------------------------------

  function toggleSelectionMode() {
    setSelectionMode((current) => !current);
    setSelectedIds(new Set());
    setAutoSelectingAll(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (hasNextPage) setAutoSelectingAll(true);
    else setSelectedIds(new Set(filtered.map((item) => item.id)));
  }

  // Só marca "tudo selecionado" quando não falta carregar nada (senão pareceria cobrir produtos que
  // ainda nem vieram do servidor).
  const allSelected = !hasNextPage && filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id));

  function shareMessage() {
    const lines = filtered
      .filter((item) => selectedIds.has(item.id))
      .map((item) => {
        const price = item.isPromoActive && item.promoPrice !== null ? item.promoPrice : item.price;
        return `• ${item.product.name} - ${formatCurrency(price)}`;
      });
    const link = (store ? storeUrl(store.handle) : undefined);
    return `Confira esses produtos na minha loja:\n\n${lines.join('\n')}${link ? `\n\nLoja: ${link}` : ''}`;
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(shareMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('Não foi possível copiar. Use o botão do WhatsApp.');
    }
  }

  function shareOnWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage())}`, '_blank', 'noopener,noreferrer');
  }

  // --- Estados vazios ----------------------------------------------------------------------------

  const status = productsQuery.isPending ? 'loading' : productsQuery.isError ? 'error' : 'ready';
  const hasCustomView = Boolean(categoryId) || sort !== 'recent';
  const storeIsEmpty = status === 'ready' && total === 0 && !isSearching && !hasCustomView;
  const activeCategoryName = categories.find((category) => category.id === categoryId)?.name;

  return (
    <div className="w-full pb-24">
      <OverLimitBanner />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <Icon name="box" size={20} />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-ink-900">Meus produtos</h1>
            <p className="text-xs text-ink-400">
              {selectionMode
                ? selectedIds.size === 0
                  ? 'Clique nos produtos para selecionar'
                  : `${selectedIds.size} selecionado${selectedIds.size === 1 ? '' : 's'}`
                : plan
                  ? plan.limits.maxProducts === null
                    ? `${plan.usage.products} produtos na loja · plano ${plan.plan.name}`
                    : `${plan.usage.products} de ${plan.limits.maxProducts} produtos · plano ${plan.plan.name}`
                  : 'Estoque da sua loja'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectionMode ? (
            <button
              type="button"
              onClick={toggleSelectionMode}
              className="h-9 rounded-lg border border-ink-200 px-4 text-xs font-semibold text-ink-600 transition hover:bg-ink-50"
            >
              Cancelar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleSelectionMode}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
              >
                <Icon name="check" size={14} />
                Selecionar
              </button>
              <Link
                href="/produtos/novo"
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary-500 px-4 text-xs font-semibold text-white transition hover:bg-primary-600"
              >
                <Icon name="plus" size={15} />
                Novo produto
              </Link>
            </>
          )}
        </div>
      </div>

      {selectionMode && (
        <div className="animate-fade-up mb-4 flex items-center justify-between rounded-xl bg-ink-50 px-4 py-2.5">
          <button
            type="button"
            onClick={() => (allSelected ? setSelectedIds(new Set()) : selectAll())}
            disabled={autoSelectingAll}
            role="checkbox"
            aria-checked={allSelected}
            className="flex items-center gap-2 text-xs font-semibold text-ink-700"
          >
            <Checkbox checked={allSelected} />
            {autoSelectingAll ? 'Selecionando todos...' : 'Selecionar todos'}
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-semibold text-ink-400 hover:text-ink-700"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 focus-within:border-primary-500 sm:max-w-md">
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

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`h-10 rounded-lg px-3.5 text-xs font-semibold transition ${
                filter === key
                  ? 'bg-primary-500 text-white'
                  : 'border border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Select
            value={sort}
            onChange={(value) => setSort(value as StoreProductSort)}
            label="Ordenar por"
            active={sort !== 'recent'}
            options={SORT_OPTIONS}
          />
          <Select
            value={categoryId}
            onChange={setCategoryId}
            label="Filtrar por categoria"
            active={categoryId !== ''}
            options={[
              { value: '', label: 'Todas as categorias' },
              ...categories.map((category) => ({
                value: category.id,
                label: `${category.name} (${category.productCount})`,
              })),
            ]}
          />
        </div>
      </div>

      <p className="mb-3 min-h-4 text-[11px] text-ink-400">
        {status === 'ready' && filter !== 'all' &&
          `Mostrando ${filtered.length} entre os ${loaded.length} produtos carregados${hasNextPage ? '. Role a lista para carregar mais.' : '.'}`}
        {status === 'ready' && isSearching && filter === 'all' &&
          `${total === 1 ? '1 resultado' : `${total.toLocaleString('pt-BR')} resultados`} para "${term}"`}
        {status === 'ready' && !isSearching && filter === 'all' && activeCategoryName &&
          `${total === 1 ? '1 produto' : `${total.toLocaleString('pt-BR')} produtos`} em ${activeCategoryName}`}
      </p>

      {actionError && (
        <p className="animate-fade-up mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {actionError}
        </p>
      )}

      {status === 'loading' && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="h-44 animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl border border-ink-100 p-10 text-center">
          <p className="mb-3 text-sm font-medium text-danger">{getErrorMessage(productsQuery.error)}</p>
          <button
            type="button"
            onClick={() => void productsQuery.refetch()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {status === 'ready' && filtered.length === 0 && (
        <div className="animate-fade-up flex min-h-85 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
            <Icon name={storeIsEmpty ? 'box' : 'search'} size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold text-ink-900">
            {storeIsEmpty
              ? 'Sua loja ainda não tem produtos'
              : isSearching || hasCustomView
                ? 'Nenhum produto encontrado'
                : 'Nenhum produto neste filtro'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-ink-400">
            {storeIsEmpty
              ? 'Escolha produtos do catálogo, defina o seu preço e comece a vender.'
              : isSearching
                ? isBarcodeSearch
                  ? `Nenhum produto da sua loja tem o código de barras ${term}.`
                  : `Nada na sua loja corresponde a "${term}".`
                : hasNextPage
                  ? 'O filtro considera só os produtos já carregados.'
                  : 'Tente outro filtro, ordenação ou categoria.'}
          </p>
          {storeIsEmpty ? (
            <Link
              href="/produtos/novo"
              className="mt-4 rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
            >
              Adicionar do catálogo
            </Link>
          ) : (
            hasNextPage && (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
              >
                {isFetchingNextPage ? 'Carregando...' : 'Carregar mais produtos'}
              </button>
            )
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((item, index) => (
            <ProductCard
              key={item.id}
              item={item}
              delay={Math.min(index % STORE_PRODUCTS_PAGE_SIZE, 8) * 30}
              selectionMode={selectionMode}
              selected={selectedIds.has(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
              onPatched={patchProduct}
              onError={handleError}
              onToggleVisibility={() => visibilityMutation.mutate({ id: item.id, isActive: !item.isActive })}
            />
          ))}
        </div>
      )}

      {/* Marcador de "fim da lista": ao aparecer na tela carrega a próxima página. */}
      <div ref={sentinelRef} className="mt-5 flex min-h-8 items-center justify-center text-xs text-ink-400">
        {isFetchingNextPage && 'Carregando mais produtos...'}
        {!isFetchingNextPage && hasNextPage && filtered.length > 0 && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            className="rounded-lg border border-ink-200 px-4 py-2 font-medium text-ink-700 transition hover:bg-ink-50"
          >
            Carregar mais
          </button>
        )}
      </div>

      {selectionMode && selectedIds.size > 0 && (
        <div className="animate-fade-up fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-ink-100 bg-white p-2 shadow-xl">
          <span className="px-3 text-xs font-semibold text-ink-700">{selectedIds.size} selecionados</span>
          <button
            type="button"
            onClick={() => void copyMessage()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 px-4 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            <Icon name="copy" size={14} />
            {copied ? 'Copiado!' : 'Copiar lista'}
          </button>
          <button
            type="button"
            onClick={shareOnWhatsApp}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-primary-500 px-4 text-xs font-semibold text-white transition hover:bg-primary-600"
          >
            <Icon name="externalLink" size={14} />
            Compartilhar no WhatsApp
          </button>
        </div>
      )}
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
        checked ? 'border-primary-500 bg-primary-500 text-white' : 'border-ink-300 bg-white text-transparent'
      }`}
    >
      <Icon name="check" size={13} strokeWidth={3} />
    </span>
  );
}

function Select({
  value,
  onChange,
  label,
  active,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  active: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={`h-10 max-w-50 cursor-pointer appearance-none truncate rounded-lg border pl-3 pr-9 text-xs font-semibold outline-none transition ${
          active
            ? 'border-primary-500 bg-primary-500 text-white'
            : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50 focus:border-primary-500'
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-ink-900">
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        size={14}
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${active ? 'text-white' : 'text-ink-400'}`}
      />
    </div>
  );
}

// Mesmos dados do card do app: marca e PROMO sobre a foto, preço sugerido do catálogo, rentabilidade da
// marca, preço (com promoção), situação do estoque e o stepper − / + que altera o estoque de verdade.
function ProductCard({
  item,
  delay,
  selectionMode,
  selected,
  onToggleSelect,
  onPatched,
  onError,
  onToggleVisibility,
}: {
  item: StoreProduct;
  delay: number;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPatched: (updated: StoreProduct) => void;
  onError: (error: unknown) => void;
  onToggleVisibility: () => void;
}) {
  const { product } = item;
  const stepper = useStockStepper({
    current: item.stock,
    save: async (value) => onPatched(await updateStoreProduct(item.id, { stock: value })),
    onError,
  });
  const stock = stepper.value;
  const isOutOfStock = stock === 0;
  const isLowStock = stock > 0 && stock <= LOW_STOCK_THRESHOLD;
  const suggested = hasSuggestedPrice(product.basePrice);
  const promo = item.isPromoActive && item.promoPrice !== null;
  const image = product.productImageSm ?? product.productImage;

  return (
    <div
      className={`animate-fade-up rounded-2xl border bg-white p-4 transition-all duration-300 ${
        selected ? 'border-primary-500 ring-2 ring-primary-100' : 'border-ink-100 hover:border-ink-200'
      } ${selectionMode ? 'cursor-pointer' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={selectionMode ? onToggleSelect : undefined}
    >
      <div className={`flex gap-3 transition-opacity ${item.isActive && !item.isFrozen ? '' : 'opacity-60'}`}>
        {selectionMode && (
          <div className="flex items-center" aria-label={selected ? 'Selecionado' : 'Não selecionado'}>
            <Checkbox checked={selected} />
          </div>
        )}

        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50">
          <span className="absolute left-1.5 top-1.5 z-10 max-w-20 truncate rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-ink-700 shadow-sm">
            {product.brand.name}
          </span>
          {promo && (
            <span className="absolute right-1.5 top-1.5 z-10 rounded-md bg-danger px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
              PROMO
            </span>
          )}
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name="box" size={30} className="text-primary-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-bold text-ink-900">{product.name}</p>
            {!selectionMode && (
              <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={onToggleVisibility}
                  aria-label={item.isActive ? 'Ocultar da vitrine' : 'Mostrar na vitrine'}
                  title={item.isActive ? 'Ocultar da vitrine' : 'Mostrar na vitrine'}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-ink-50 ${
                    item.isActive ? 'text-ink-400 hover:text-ink-700' : 'text-warning'
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {!item.isActive && <path d="m3 3 18 18" />}
                  </svg>
                </button>
                <Link
                  href={`/produtos/${item.id}`}
                  aria-label={`Editar ${product.name}`}
                  title="Editar produto"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-50 hover:text-primary-500"
                >
                  <Icon name="edit" size={15} />
                </Link>
              </div>
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className={`truncate text-xs text-ink-400 ${suggested ? 'line-through' : ''}`}>
              {suggested ? `Sugerido: ${formatCurrency(product.basePrice)}` : 'Sem preço sugerido'}
            </span>
            {product.brand.profitability > 0 && (
              <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                {product.brand.profitability}% RENTABILIDADE
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            {promo ? (
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-extrabold text-danger">{formatCurrency(item.promoPrice as number)}</span>
                <span className="text-xs text-ink-400 line-through">{formatCurrency(item.price)}</span>
              </div>
            ) : (
              <span className="text-lg font-extrabold text-ink-900">{formatCurrency(item.price)}</span>
            )}
            {item.isFrozen ? (
              <span className="text-xs font-semibold text-danger" title="Acima do limite do plano: fora da vitrine. Você pode apagá-lo.">
                Congelado
              </span>
            ) : (
              !item.isActive && <span className="text-xs font-semibold text-warning">Oculto na vitrine</span>
            )}
          </div>
        </div>
      </div>

      <div className="my-3 h-px bg-ink-100" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Icon
            name={isOutOfStock || isLowStock ? 'bell' : 'check'}
            size={15}
            strokeWidth={2.2}
            className={isOutOfStock ? 'text-danger' : isLowStock ? 'text-warning' : 'text-success'}
          />
          {isOutOfStock ? (
            <span className="text-xs font-bold text-danger">Esgotado</span>
          ) : (
            <span className="text-xs text-ink-700">
              <span className={`font-bold ${isLowStock ? 'text-warning' : 'text-success'}`}>
                {isLowStock ? 'Estoque Baixo' : 'Estoque Seguro'}:
              </span>{' '}
              {stock} un
            </span>
          )}
        </div>

        {/* O stepper não participa da seleção: clicar nele não marca o card. */}
        <div
          className="flex items-center rounded-full bg-ink-50"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={stepper.decrement}
            disabled={stock <= 0 || selectionMode}
            aria-label="Diminuir estoque"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 transition hover:bg-ink-100 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14" />
            </svg>
          </button>
          <span
            className={`min-w-8 px-1 text-center text-sm font-bold text-ink-900 transition-opacity ${
              stepper.saving ? 'opacity-60' : ''
            }`}
            aria-label={`Estoque: ${stock}`}
          >
            {stock}
          </span>
          <button
            type="button"
            onClick={stepper.increment}
            disabled={stock >= STOCK_MAX || selectionMode}
            aria-label="Aumentar estoque"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
