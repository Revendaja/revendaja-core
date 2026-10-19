import { request, requestDetailed } from './http';
import { buildQuery } from './query';
import type {
  CreateSaleInput,
  Paginated,
  SaleDetail,
  SaleListItem,
  SalesSummary,
  SaleSource,
  SaleStatusValue,
  StaleProduct,
  TopProduct,
} from './types';

export const SALES_PAGE_SIZE = 20;

// 201 = venda nova (o estoque foi baixado). 200 = o mesmo clientRequestId de novo: devolve a MESMA venda, sem baixar
// o estoque outra vez (`replayed`). Os dois são sucesso.
export async function createSale(input: CreateSaleInput) {
  const { status, data } = await requestDetailed<SaleDetail>('/sales', { method: 'POST', body: input, auth: true });
  return { sale: data, replayed: status === 200 };
}

type Period = { from: string; to: string };

// `from` inclusivo e `to` exclusivo, em ISO-8601 (Z ou offset). Ambos obrigatórios. Com `source`, só as vendas dessa
// origem (`online` = pedidos da vitrine).
export function getSalesSummary({ from, to, source }: Period & { source?: SaleSource }) {
  return request<SalesSummary>(`/sales/summary${buildQuery({ from, to, source })}`, { auth: true });
}

// Mais recente primeiro. `from`, `to`, `status` e `source` são opcionais; a lista não traz os itens.
export function listSales(params: {
  from?: string;
  to?: string;
  status?: SaleStatusValue;
  source?: SaleSource;
  page?: number;
  pageSize?: number;
}) {
  const { from, to, status, source, page = 1, pageSize = SALES_PAGE_SIZE } = params;
  return request<Paginated<SaleListItem>>(`/sales${buildQuery({ from, to, status, source, page, pageSize })}`, {
    auth: true,
  });
}

export function getSale(id: string) {
  return request<SaleDetail>(`/sales/${id}`, { auth: true });
}

// Cancela um pedido PENDENTE e devolve o estoque que ele reservou (venda paga não cancela: 409). Repetir em uma venda
// já cancelada devolve 200 igual, sem devolver o estoque de novo.
export function cancelSale(id: string) {
  return request<SaleDetail>(`/sales/${id}`, { method: 'PATCH', body: { status: 'cancelled' }, auth: true });
}

// Só `pending` vira `paid`; repetir em uma venda já paga devolve 200 igual (uma cancelada dá 409).
export function markSalePaid(id: string) {
  return request<SaleDetail>(`/sales/${id}`, { method: 'PATCH', body: { status: 'paid' }, auth: true });
}

// Produtos mais vendidos por quantidade (só vendas pagas), `from` inclusivo e `to` exclusivo.
export function getTopProducts(params: Period & { limit?: number }) {
  const { from, to, limit } = params;
  return request<{ items: TopProduct[] }>(`/sales/top-products${buildQuery({ from, to, limit })}`, { auth: true });
}

// Produtos com estoque (> 0) sem venda paga nos últimos `days` dias, os com mais estoque parado primeiro.
export function getStaleProducts(params: { days?: number; limit?: number } = {}) {
  const { days, limit } = params;
  return request<{ items: StaleProduct[] }>(`/sales/stale-products${buildQuery({ days, limit })}`, { auth: true });
}
