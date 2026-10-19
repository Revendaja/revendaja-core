import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { getErrorMessage } from '../api/errors';
import type { Paginated } from '../api/types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type Options = {
  pageSize: number;
  // false = não carrega (ex.: esperando a tela ser aberta).
  enabled?: boolean;
  // Identifica esta lista no cache do TanStack Query: telas diferentes com a MESMA chave
  // compartilham o cache (prefetch, staleTime) e são atualizadas juntas por uma invalidação.
  queryKey: QueryKey;
};

// Lista paginada com rolagem infinita, por cima do `useInfiniteQuery` do TanStack Query — o cache por
// chave, o `staleTime` e a invalidação depois de mutações já vêm de graça da lib; aqui só se adapta o
// formato pro que as telas (Estoque, catálogo, vendas) já esperavam.
export function usePaginatedList<T extends { id: string | number }>(
  fetchPage: (page: number, pageSize: number) => Promise<Paginated<T>>,
  { pageSize, enabled = true, queryKey }: Options
) {
  // Erro só de "carregar mais" (a primeira carga usa `query.error`): fica separado pra a lista já
  // carregada continuar na tela com um "tentar novamente" no rodapé, em vez de sumir.
  const [actionError, setActionError] = useState<string | null>(null);
  // Só true quando ALGUÉM pediu a atualização (puxar a lista, "tentar novamente"): o indicador de
  // "atualizando" não deve aparecer pra revalidação silenciosa em segundo plano (useRefetchOnFocus,
  // ou uma invalidação depois de uma mutação em outro canto do app) — por isso não usa
  // `query.isRefetching` direto, que fica true nesses casos também.
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    enabled,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  const status: Status = !enabled ? 'idle' : query.isPending ? 'loading' : query.isError ? 'error' : 'ready';

  async function loadMore() {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    setActionError(null);
    try {
      await query.fetchNextPage();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function refresh() {
    setActionError(null);
    setManualRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setManualRefreshing(false);
    }
  }

  return {
    items,
    total,
    status,
    error: query.error ? getErrorMessage(query.error) : null,
    actionError,
    refreshing: manualRefreshing,
    loadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    // "Tentar novamente" (erro na primeira carga) e "puxar para atualizar" fazem a mesma coisa aqui.
    reload: refresh,
    refresh,
    loadMore,
  };
}
