import { request } from './http';
import { buildQuery } from '../utils/dates';
import type { Brand, CatalogProduct, Paginated } from './types';

export const CATALOG_PAGE_SIZE = 20;

// As marcas mudam raramente: quem chama cacheia com `staleTime: Infinity`.
export function listBrands() {
  return request<Brand[]>('/catalog/brands', { auth: true });
}

// A lista vem sempre ordenada por nome (A→Z). Nunca envia `search` vazio (a API responde 400).
export function listCatalogProducts(page: number, options: { search?: string; brandId?: number | null } = {}) {
  const trimmed = options.search?.trim();
  const query = buildQuery({
    search: trimmed ? trimmed : undefined,
    brandId: options.brandId ?? undefined,
    page,
    pageSize: CATALOG_PAGE_SIZE,
  });
  return request<Paginated<CatalogProduct>>(`/catalog/products${query}`, { auth: true });
}

export function getCatalogProduct(id: number) {
  return request<CatalogProduct>(`/catalog/products/${id}`, { auth: true });
}
