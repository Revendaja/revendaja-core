import { request } from './http';
import type { StoreCategory } from './types';

// Categorias que a PRÓPRIA loja criou pra organizar os produtos (não é uma lista fixa da plataforma).
export function listStoreCategories() {
  return request<{ items: StoreCategory[] }>('/store/products/categories', { auth: true });
}

export function createStoreCategory(name: string) {
  return request<StoreCategory>('/store/products/categories', { method: 'POST', body: { name }, auth: true });
}

export function deleteStoreCategory(id: string) {
  return request<null>(`/store/products/categories/${id}`, { method: 'DELETE', auth: true });
}
