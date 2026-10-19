export interface CatalogBrand {
  // null só na marca sintética "Produto Próprio" de um StoreProduct manual (ver store.repository).
  id: number | null;
  name: string;
  logo: string | null;
  profitability: number;
}

export interface CatalogProduct {
  // null só no produto sintético de um StoreProduct manual (ver store.repository): ele não tem
  // vínculo com o catálogo global.
  id: number | null;
  name: string;
  barCode: string | null;
  brandSku: string | null;
  description: string | null;
  productImage: string | null;
  productImageSm: string | null;
  basePrice: number;
  brand: CatalogBrand;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
