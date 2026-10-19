import { request } from './http';
import { buildQuery } from '../utils/dates';
import type { CreateOrderInput, OnlineOrderReceipt, Storefront, StorefrontHome } from './types';

export const STOREFRONT_PAGE_SIZE = 24;

// Rotas públicas (sem login): o cliente da loja não tem conta.
// Filtro dos atalhos de categoria: uma categoria própria da loja ou uma marca.
export type StorefrontFilter = { type: 'category' | 'brand'; id: string } | null;

export function getStorefront(
  handle: string,
  options: { search?: string; page?: number; pageSize?: number; filter?: StorefrontFilter } = {},
) {
  const trimmed = options.search?.trim();
  const query = buildQuery({
    search: trimmed ? trimmed : undefined,
    category: options.filter?.type === 'category' ? options.filter.id : undefined,
    brand: options.filter?.type === 'brand' ? options.filter.id : undefined,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? STOREFRONT_PAGE_SIZE,
  });
  return request<Storefront>(`/public/stores/${encodeURIComponent(handle)}${query}`);
}

// Uma visita por abertura da vitrine (204, sem corpo). Falha silenciosa: contar visita nunca atrapalha o cliente.
export async function recordStorefrontVisit(handle: string) {
  try {
    await request<void>(`/public/stores/${encodeURIComponent(handle)}/visits`, { method: 'POST' });
  } catch {
    // ignorado de propósito
  }
}

// Idempotente por `clientRequestId`: repetir o mesmo id devolve o mesmo pedido (não duplica nem baixa estoque de novo).
export function createStorefrontOrder(handle: string, input: CreateOrderInput) {
  return request<OnlineOrderReceipt>(`/public/stores/${encodeURIComponent(handle)}/orders`, {
    method: 'POST',
    body: input,
  });
}

// Página inicial: banners/textos (padrão ou personalizados), atalhos de categoria e as seções
// montadas com o estoque da loja.
export function getStorefrontHome(handle: string) {
  return request<StorefrontHome>(`/public/stores/${encodeURIComponent(handle)}/home`);
}
