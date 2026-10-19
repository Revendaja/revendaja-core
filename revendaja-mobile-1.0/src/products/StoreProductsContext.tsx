import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { isApiError } from '../api/errors';
import { queryKeys } from '../api/queryKeys';
import {
  addManualStoreProduct,
  addStoreProduct,
  deleteStoreProduct,
  listStoreProducts,
  STORE_PRODUCTS_PAGE_SIZE,
  updateStoreProduct,
} from '../api/storeProducts';
import type { CreateManualStoreProductInput, StoreProductChanges } from '../api/storeProducts';
import type { Paginated, StoreProduct } from '../api/types';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { useStoreAccessGuard } from './useStoreAccessGuard';

type ListView = {
  items: StoreProduct[];
  total: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  actionError: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

type StockDelta = { storeProductId: string; quantity: number };

// A lista principal (sem busca) vem "achatada" no valor do contexto; a busca do servidor fica em `search`.
type StoreProductsValue = ListView & {
  // Busca em "meus produtos" no servidor (nome ou código de barras). Vazia = usa a lista principal.
  search: ListView & { term: string };
  setSearchTerm: (term: string) => void;
  // ids (do catálogo) dos produtos que já sabemos estar na loja: os carregados + os que a API avisou com 409.
  inStoreProductIds: ReadonlySet<number>;
  findById: (id: string) => StoreProduct | undefined;
  // Devolvem o StoreProduct da resposta da API e já atualizam o cache. Erros são lançados para a tela exibir.
  add: (catalogProductId: number, price: number, stock: number, costPrice?: number | null) => Promise<StoreProduct>;
  addManual: (input: CreateManualStoreProductInput) => Promise<StoreProduct>;
  update: (id: string, changes: StoreProductChanges) => Promise<StoreProduct>;
  remove: (id: string) => Promise<void>;
  // Depois de uma venda nova (201): desconta o estoque vendido no cache, sem recarregar tudo.
  applyStockDelta: (deltas: StockDelta[]) => void;
};

const StoreProductsContext = createContext<StoreProductsValue | null>(null);

type StoreProductsCache = InfiniteData<Paginated<StoreProduct>>;

// Prepend na primeira página (o produto novo é o mais recente) e +1 no total de todas as páginas —
// mesmo raciocínio do `mutateMain` de antes, só que aplicado em toda lista já em cache (principal e
// qualquer busca) de uma vez, via `setQueriesData` com o prefixo da chave.
function prependItem(data: StoreProductsCache | undefined, item: StoreProduct): StoreProductsCache | undefined {
  if (!data || data.pages.length === 0) return data;
  const [first, ...rest] = data.pages;
  return {
    ...data,
    pages: [
      { ...first, items: [item, ...first.items.filter((existing) => existing.id !== item.id)], total: first.total + 1 },
      ...rest,
    ],
  };
}

function replaceItem(data: StoreProductsCache | undefined, item: StoreProduct): StoreProductsCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((existing) => (existing.id === item.id ? item : existing)),
    })),
  };
}

function removeItem(data: StoreProductsCache | undefined, id: string): StoreProductsCache | undefined {
  if (!data) return data;
  const existsSomewhere = data.pages.some((page) => page.items.some((item) => item.id === id));
  if (!existsSomewhere) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
      total: Math.max(0, page.total - 1),
    })),
  };
}

function adjustStock(data: StoreProductsCache | undefined, deltas: Map<string, number>): StoreProductsCache | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => {
        const quantity = deltas.get(item.id);
        return quantity ? { ...item, stock: Math.max(0, item.stock - quantity) } : item;
      }),
    })),
  };
}

// Vive dentro do app logado (Main): ao sair da conta o provider desmonta. O cache em si (TanStack
// Query) some junto com o app fechando — não persiste entre sessões, igual antes.
export function StoreProductsProvider({ children }: { children: React.ReactNode }) {
  const [knownInStore, setKnownInStore] = useState<ReadonlySet<number>>(new Set());
  const [searchTerm, setSearchTermState] = useState('');

  const guard = useStoreAccessGuard();
  const queryClient = useQueryClient();

  const main = usePaginatedList<StoreProduct>((page, pageSize) => guard(() => listStoreProducts(page, pageSize)), {
    pageSize: STORE_PRODUCTS_PAGE_SIZE,
    queryKey: queryKeys.storeProducts.list(''),
  });

  // A busca não pode reaproveitar a lista principal: ela precisa continuar completa para "Na loja" (catálogo) e
  // para abrir o detalhe de qualquer produto carregado.
  const searchList = usePaginatedList<StoreProduct>(
    (page, pageSize) => guard(() => listStoreProducts(page, pageSize, searchTerm)),
    { pageSize: STORE_PRODUCTS_PAGE_SIZE, enabled: searchTerm !== '', queryKey: queryKeys.storeProducts.list(searchTerm) }
  );

  const setSearchTerm = useCallback((term: string) => setSearchTermState(term.trim()), []);

  const inStoreProductIds = useMemo(() => {
    const ids = new Set<number>(knownInStore);
    // Produto manual não tem id de catálogo (`product.id` é null): não entra nesse Set.
    for (const item of main.items) {
      if (item.product.id !== null) ids.add(item.product.id);
    }
    return ids;
  }, [main.items, knownInStore]);

  const findById = useCallback(
    (id: string) => main.items.find((item) => item.id === id) ?? searchList.items.find((item) => item.id === id),
    [main.items, searchList.items]
  );

  const add = useCallback(
    async (catalogProductId: number, price: number, stock: number, costPrice?: number | null) => {
      try {
        const created = await guard(() => addStoreProduct({ productId: catalogProductId, price, stock, costPrice }));
        queryClient.setQueriesData<StoreProductsCache>({ queryKey: queryKeys.storeProducts.all() }, (data) =>
          prependItem(data, created)
        );
        setKnownInStore((previous) => new Set(previous).add(catalogProductId));
        return created;
      } catch (error) {
        // 409 "Este produto já está na sua loja.": não é falha, o produto passa a constar como "já adicionado".
        if (isApiError(error) && error.status === 409) {
          setKnownInStore((previous) => new Set(previous).add(catalogProductId));
        }
        throw error;
      }
    },
    [guard, queryClient]
  );

  const addManual = useCallback(
    async (input: CreateManualStoreProductInput) => {
      const created = await guard(() => addManualStoreProduct(input));
      queryClient.setQueriesData<StoreProductsCache>({ queryKey: queryKeys.storeProducts.all() }, (data) =>
        prependItem(data, created)
      );
      return created;
    },
    [guard, queryClient]
  );

  const update = useCallback(
    async (id: string, changes: StoreProductChanges) => {
      const updated = await guard(() => updateStoreProduct(id, changes));
      queryClient.setQueriesData<StoreProductsCache>({ queryKey: queryKeys.storeProducts.all() }, (data) =>
        replaceItem(data, updated)
      );
      return updated;
    },
    [guard, queryClient]
  );

  const remove = useCallback(
    async (id: string) => {
      const removed = findById(id);
      await guard(() => deleteStoreProduct(id));
      queryClient.setQueriesData<StoreProductsCache>({ queryKey: queryKeys.storeProducts.all() }, (data) =>
        removeItem(data, id)
      );
      // Removido da loja, o produto pode ser adicionado de novo.
      if (removed && removed.product.id !== null) {
        const catalogProductId = removed.product.id;
        setKnownInStore((previous) => {
          const next = new Set(previous);
          next.delete(catalogProductId);
          return next;
        });
      }
    },
    [findById, guard, queryClient]
  );

  const applyStockDelta = useCallback(
    (deltas: StockDelta[]) => {
      if (deltas.length === 0) return;
      const sold = new Map<string, number>();
      for (const { storeProductId, quantity } of deltas) {
        sold.set(storeProductId, (sold.get(storeProductId) ?? 0) + quantity);
      }
      queryClient.setQueriesData<StoreProductsCache>({ queryKey: queryKeys.storeProducts.all() }, (data) =>
        adjustStock(data, sold)
      );
    },
    [queryClient]
  );

  const value = useMemo<StoreProductsValue>(
    () => ({
      items: main.items,
      total: main.total,
      status: main.status,
      error: main.error,
      actionError: main.actionError,
      refreshing: main.refreshing,
      loadingMore: main.loadingMore,
      hasMore: main.hasMore,
      reload: main.reload,
      refresh: main.refresh,
      loadMore: main.loadMore,
      search: {
        term: searchTerm,
        items: searchList.items,
        total: searchList.total,
        status: searchList.status,
        error: searchList.error,
        actionError: searchList.actionError,
        refreshing: searchList.refreshing,
        loadingMore: searchList.loadingMore,
        hasMore: searchList.hasMore,
        reload: searchList.reload,
        refresh: searchList.refresh,
        loadMore: searchList.loadMore,
      },
      setSearchTerm,
      inStoreProductIds,
      findById,
      add,
      addManual,
      update,
      remove,
      applyStockDelta,
    }),
    [
      main,
      searchList,
      searchTerm,
      setSearchTerm,
      inStoreProductIds,
      findById,
      add,
      addManual,
      update,
      remove,
      applyStockDelta,
    ]
  );

  return <StoreProductsContext.Provider value={value}>{children}</StoreProductsContext.Provider>;
}

export function useStoreProducts() {
  const context = useContext(StoreProductsContext);
  if (!context) throw new Error('useStoreProducts deve ser usado dentro de <StoreProductsProvider>');
  return context;
}
