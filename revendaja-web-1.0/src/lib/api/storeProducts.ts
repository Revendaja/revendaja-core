import { request, getFreshAccessToken } from './http';
import { API_URL } from './config';
import { ApiError, NetworkError } from './errors';
import { buildQuery } from '../utils/dates';
import type { Paginated, StoreProduct, StoreProductSort } from './types';

export const STORE_PRODUCTS_PAGE_SIZE = 20;

// Do mais recente para o mais antigo, a menos que `sort` diga outra ordem. `search` busca por nome ou
// código de barras (8 a 14 dígitos); nunca é enviado vazio (a API responde 400).
export function listStoreProducts(
  page: number,
  options: { search?: string; categoryId?: string; sort?: StoreProductSort; pageSize?: number } = {},
) {
  const trimmed = options.search?.trim();
  const query = buildQuery({
    search: trimmed ? trimmed : undefined,
    categoryId: options.categoryId,
    sort: options.sort && options.sort !== 'recent' ? options.sort : undefined,
    page,
    pageSize: options.pageSize ?? STORE_PRODUCTS_PAGE_SIZE,
  });
  return request<Paginated<StoreProduct>>(`/store/products${query}`, { auth: true });
}

export function getStoreProduct(id: string) {
  return request<StoreProduct>(`/store/products/${id}`, { auth: true });
}

export type ManualStoreProductComponentChange = { storeProductId: string; quantity: number };

// Envie só o que mudou. `stock`/`minStock` são valores ABSOLUTOS; `isActive: false` tira o produto da
// vitrine sem apagá-lo. `categoryId: null` tira da categoria; `costPrice: null` limpa o custo.
// `promoPrice`/`promoEndsAt` sempre juntos (os dois null = remover promoção). `name`/`description`/
// `image`/`components` só valem num produto manual (a API recusa num produto do catálogo).
export type UpdateStoreProductInput = {
  price?: number;
  costPrice?: number | null;
  stock?: number;
  minStock?: number;
  isActive?: boolean;
  categoryId?: string | null;
  promoPrice?: number | null;
  promoEndsAt?: string | null;
  name?: string;
  description?: string | null;
  image?: string | null;
  components?: ManualStoreProductComponentChange[];
};

export function updateStoreProduct(id: string, changes: UpdateStoreProductInput) {
  return request<StoreProduct>(`/store/products/${id}`, { method: 'PATCH', body: changes, auth: true });
}

// Remove o produto da loja (não afeta o catálogo global nem outras lojas que também o tenham).
export function removeStoreProduct(id: string) {
  return request<void>(`/store/products/${id}`, { method: 'DELETE', auth: true });
}

// Adiciona à loja um produto do catálogo. `productId` é o id numérico do catálogo; `price` e `costPrice`
// em reais. `costPrice` ausente = "não informado" (0 é um custo válido). 409 = já está na loja.
export function addStoreProduct(input: { productId: number; price: number; stock: number; costPrice?: number }) {
  return request<StoreProduct>('/store/products', { method: 'POST', body: input, auth: true });
}

export type ManualStoreProductComponentInput = { storeProductId: string; quantity: number };

export type CreateManualStoreProductInput = {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  costPrice?: number | null;
  stock: number;
  // Ausente = produto simples (sem kit). Presente define a composição do kit.
  components?: ManualStoreProductComponentInput[];
};

// Produto próprio, fora do catálogo (ex.: um ursinho ou uma cesta de presente).
export function addManualStoreProduct(input: CreateManualStoreProductInput) {
  return request<StoreProduct>('/store/products/manual', { method: 'POST', body: input, auth: true });
}

// Sobe uma imagem para o servidor (multipart, campo "image") e devolve a URL pública.
export async function uploadImage(path: string, file: File): Promise<{ url: string }> {
  const token = await getFreshAccessToken();
  const body = new FormData();
  body.append('image', file);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  } catch {
    throw new NetworkError();
  }

  const text = await response.text();
  let data: { url?: unknown; error?: unknown; message?: unknown } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok || typeof data.url !== 'string') {
    const fallback =
      response.status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Não foi possível enviar a imagem.';
    throw new ApiError(
      response.status,
      typeof data.error === 'string' ? data.error : 'UNKNOWN_ERROR',
      typeof data.message === 'string' && data.message ? data.message : fallback,
    );
  }
  return { url: data.url };
}

// Imagem do produto manual.
export function uploadProductImage(file: File) {
  return uploadImage('/uploads/product-image', file);
}
