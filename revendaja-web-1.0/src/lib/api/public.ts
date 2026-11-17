import { request } from './http';
import { buildQuery } from '../utils/dates';
import type {
  CouponPreview,
  CreateOrderInput,
  OnlineOrderReceipt,
  Storefront,
  StorefrontHome,
  StorefrontProductDetail,
} from './types';

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

// Confere um cupom contra os itens do carrinho e devolve o desconto. O servidor calcula o subtotal
// com os preços da loja; o uso do cupom só é consumido ao fazer o pedido. 400 `COUPON_INVALID` com a
// mensagem do motivo (vencido, esgotado, abaixo do mínimo...).
export function previewCoupon(handle: string, input: { code: string; items: { storeProductId: string; quantity: number }[] }) {
  return request<CouponPreview>(`/public/stores/${encodeURIComponent(handle)}/coupons/validate`, {
    method: 'POST',
    body: input,
  });
}

// Página inicial: banners/textos (padrão ou personalizados), atalhos de categoria e as seções
// montadas com o estoque da loja.
export function getStorefrontHome(handle: string) {
  return request<StorefrontHome>(`/public/stores/${encodeURIComponent(handle)}/home`);
}

// Detalhes de um produto da vitrine + parecidos. 404 (PRODUCT_NOT_FOUND) se foi ocultado ou não existe.
export function getStorefrontProduct(handle: string, productId: string) {
  return request<StorefrontProductDetail>(
    `/public/stores/${encodeURIComponent(handle)}/products/${encodeURIComponent(productId)}`,
  );
}
