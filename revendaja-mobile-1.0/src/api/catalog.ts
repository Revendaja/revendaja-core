import { request } from './http';
import { buildQuery } from './query';
import type { Brand, CatalogProduct, Paginated } from './types';

export const CATALOG_PAGE_SIZE = 20;

// As marcas mudam raramente: quem chama cacheia com `staleTime: Infinity` (ver queryKeys.catalog.brands).
export function listBrands(): Promise<Brand[]> {
  return request<Brand[]>('/catalog/brands', { auth: true });
}

type CatalogProductsQuery = {
  search?: string;
  brandId?: number | null;
  page?: number;
  pageSize?: number;
};

// A lista vem sempre ordenada por nome (A→Z). Nunca envia `search` vazio (a API responde 400).
export function listCatalogProducts({ search, brandId, page = 1, pageSize = CATALOG_PAGE_SIZE }: CatalogProductsQuery) {
  const trimmed = search?.trim();
  const query = buildQuery({
    search: trimmed ? trimmed : undefined,
    brandId: brandId ?? undefined,
    page,
    pageSize,
  });
  return request<Paginated<CatalogProduct>>(`/catalog/products${query}`, { auth: true });
}

export function getCatalogProduct(id: number) {
  return request<CatalogProduct>(`/catalog/products/${id}`, { auth: true });
}
