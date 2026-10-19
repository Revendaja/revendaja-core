// Chaves de query centralizadas: o mesmo recurso usa sempre a mesma chave, não importa a tela — é o
// que faz o prefetch (RootNavigator) e a invalidação (depois de uma mutação) encontrarem o cache certo.
export const queryKeys = {
  home: () => ['home'] as const,

  storeProducts: {
    // Prefixo sozinho invalida/atualiza TODAS as listas (principal + qualquer busca + qualquer
    // ordenação/filtro de categoria) de uma vez.
    all: () => ['storeProducts'] as const,
    list: (search: string, params?: { sort?: string; categoryId?: string }) =>
      ['storeProducts', 'list', search, params ?? {}] as const,
    // Busca rápida (até poucos resultados, sem paginação) — ex.: Nova Venda. Chave separada da
    // busca paginada de `list`: os dois guardam formatos de cache diferentes.
    quickSearch: (term: string) => ['storeProducts', 'quickSearch', term] as const,
  },

  storeCategories: () => ['storeCategories'] as const,
  storeSettings: () => ['storeSettings'] as const,
  storeStats: () => ['storeStats'] as const,

  sales: {
    all: () => ['sales'] as const,
    list: (params: { from: string; to: string; status?: string; source?: string }) =>
      ['sales', 'list', params] as const,
    summary: (params: { from: string; to: string; source?: string }) => ['sales', 'summary', params] as const,
    detail: (id: string) => ['sales', 'detail', id] as const,
    topProducts: (params: { from: string; to: string; limit?: number }) =>
      ['sales', 'topProducts', params] as const,
    staleProducts: (params: { days?: number; limit?: number }) => ['sales', 'staleProducts', params] as const,
  },

  catalog: {
    products: (params: { search: string; brandId: number | null }) => ['catalog', 'products', params] as const,
    brands: () => ['catalog', 'brands'] as const,
  },

  notifications: {
    // Prefixo sozinho invalida a lista E a contagem de não lidas juntas (ex.: depois de marcar como lida).
    all: () => ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unreadCount: () => ['notifications', 'unreadCount'] as const,
  },
};
