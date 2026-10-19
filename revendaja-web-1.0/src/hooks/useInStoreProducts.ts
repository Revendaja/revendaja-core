import { useQuery } from '@tanstack/react-query';
import { listStoreProducts } from '@/lib/api/storeProducts';
import { queryKeys } from '@/lib/api/queryKeys';

const PAGE_SIZE = 100;
// Teto de segurança: 20 páginas de 100 = 2.000 produtos.
const MAX_PAGES = 20;

// Mapa "id do produto do catálogo -> id do produto na loja", para marcar no catálogo o que a loja já
// tem. Percorre a lista da loja inteira (100 por vez). Produtos manuais não entram (não têm id de catálogo).
export function useInStoreProducts() {
  const query = useQuery({
    queryKey: queryKeys.storeProductIds(),
    queryFn: async () => {
      const byCatalogId: Record<number, string> = {};
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await listStoreProducts(page, { pageSize: PAGE_SIZE });
        for (const item of result.items) {
          if (item.product.id !== null) byCatalogId[item.product.id] = item.id;
        }
        if (page * PAGE_SIZE >= result.total) break;
      }
      return { byCatalogId };
    },
    staleTime: 30_000,
  });
  return query.data?.byCatalogId ?? {};
}
