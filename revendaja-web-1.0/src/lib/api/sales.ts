import { request, requestDetailed } from './http';
import { buildQuery } from '../utils/dates';
import type {
  CreateSaleInput,
  Paginated,
  SaleDetail,
  SaleListItem,
  SaleSource,
  SalesSummary,
  SalesTimeline,
  SaleStatusValue,
  StaleProduct,
  TimelineGroupBy,
  TopBrand,
  TopProduct,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SALES_PAGE_SIZE = 20;

// Registra a venda: baixa o estoque, grava o preço/custo do momento e numera (Venda #N).
// Idempotente por `clientRequestId` — reenviar o mesmo id (retry de rede) devolve a MESMA venda em
// vez de duplicá-la. `replayed: true` (a API respondeu 200, não 201) = essa é a segunda vez que
// recebemos essa venda: o estoque já tinha sido baixado na primeira tentativa.
export async function createSale(input: CreateSaleInput) {
  const { status, data } = await requestDetailed<SaleDetail>('/sales', { method: 'POST', body: input, auth: true });
  return { sale: data, replayed: status === 200 };
}

export function listSales(
  page: number,
  options: { from?: string; to?: string; status?: SaleStatusValue; source?: SaleSource; pageSize?: number } = {},
) {
  const query = buildQuery({
    from: options.from,
    to: options.to,
    status: options.status,
    source: options.source,
    page,
    pageSize: options.pageSize ?? SALES_PAGE_SIZE,
  });
  return request<Paginated<SaleListItem>>(`/sales${query}`, { auth: true });
}

export function getSale(id: string) {
  return request<SaleDetail>(`/sales/${id}`, { auth: true });
}

// Resumo financeiro do período (`from` inclusivo, `to` exclusivo): faturamento, a receber, lucro e margem.
export function getSalesSummary(range: { from: string; to: string; source?: SaleSource }) {
  const query = buildQuery({ from: range.from, to: range.to, source: range.source });
  return request<SalesSummary>(`/sales/summary${query}`, { auth: true });
}

// Só vendas PENDENTES podem mudar de status. "paid" = a loja recebeu; "cancelled" = devolve o estoque reservado.
export function markSalePaid(id: string) {
  return request<SaleDetail>(`/sales/${id}`, { method: 'PATCH', body: { status: 'paid' }, auth: true });
}

export function cancelSale(id: string) {
  return request<SaleDetail>(`/sales/${id}`, { method: 'PATCH', body: { status: 'cancelled' }, auth: true });
}

// Janela de cada visão, no fuso do navegador (`from` inclusivo, `to` exclusivo): o ano corrente
// inteiro (janeiro a dezembro), 12 semanas (começando na segunda) ou 30 dias, estas duas terminando
// no período atual.
function timelineRange(groupBy: TimelineGroupBy, now: Date): { from: Date; to: Date } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = new Date(year, month, now.getDate());

  if (groupBy === 'month') return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) };
  if (groupBy === 'day') {
    return { from: new Date(today.getTime() - 29 * DAY_MS), to: new Date(year, month, now.getDate() + 1) };
  }
  const monday = new Date(year, month, now.getDate() - ((today.getDay() + 6) % 7));
  return { from: new Date(year, month, monday.getDate() - 11 * 7), to: new Date(year, month, monday.getDate() + 7) };
}

// Receita (vendas pagas) e custo por dia/semana/mês. `tzOffsetMinutes` faz o servidor começar o
// dia/mês no fuso de quem consulta (minutos a leste de UTC, ex.: Brasil = -180).
export function getSalesTimeline(groupBy: TimelineGroupBy, now = new Date()) {
  const { from, to } = timelineRange(groupBy, now);
  const query = buildQuery({
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy,
    tzOffsetMinutes: -now.getTimezoneOffset(),
  });
  return request<SalesTimeline>(`/sales/timeline${query}`, { auth: true });
}

// Marcas mais vendidas (só vendas pagas de produtos do catálogo) nos últimos 30 dias, por quantidade.
export function getTopBrands(limit = 3, now = new Date()) {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const from = new Date(to.getTime() - 30 * DAY_MS);
  const query = buildQuery({ from: from.toISOString(), to: to.toISOString(), limit });
  return request<{ items: TopBrand[] }>(`/sales/top-brands${query}`, { auth: true });
}

// Marcas mais vendidas (só vendas pagas de produtos do catálogo) no período escolhido, por quantidade.
// `from` inclusivo, `to` exclusivo.
export function getTopBrandsInRange(range: { from: string; to: string }, limit = 5) {
  const query = buildQuery({ from: range.from, to: range.to, limit });
  return request<{ items: TopBrand[] }>(`/sales/top-brands${query}`, { auth: true });
}

// Produtos mais vendidos por quantidade (só vendas pagas), `from` inclusivo e `to` exclusivo.
export function getTopProducts(range: { from: string; to: string }, limit = 10) {
  const query = buildQuery({ from: range.from, to: range.to, limit });
  return request<{ items: TopProduct[] }>(`/sales/top-products${query}`, { auth: true });
}

// Produtos com estoque (> 0) sem venda paga nos últimos `days` dias, os com mais estoque parado primeiro.
export function getStaleProducts(days = 30, limit = 10) {
  const query = buildQuery({ days, limit });
  return request<{ items: StaleProduct[] }>(`/sales/stale-products${query}`, { auth: true });
}
