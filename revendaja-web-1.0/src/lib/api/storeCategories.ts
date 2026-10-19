import { request } from './http';
import type { StoreCategory } from './types';

// Categorias que a PRÓPRIA loja criou para organizar os produtos.
export function listStoreCategories() {
  return request<{ items: StoreCategory[] }>('/store/products/categories', { auth: true });
}

// 409 se já existir uma categoria com o mesmo nome.
export function createStoreCategory(name: string) {
  return request<StoreCategory>('/store/products/categories', { method: 'POST', body: { name }, auth: true });
}
