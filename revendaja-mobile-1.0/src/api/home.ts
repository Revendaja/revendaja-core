import { request } from './http';
import { buildQuery } from './query';
import type { HomeSummary } from './types';
import { periodRange } from '../utils/sales';

// Tudo da tela Início numa chamada. O período é o mês de `now` no fuso do aparelho (`from` inclusivo, `to` exclusivo);
// `previousFrom` é o início do mês anterior, só para calcular o crescimento.
export function getHome(now: Date) {
  const { from, to } = periodRange('month', now.getMonth(), now);
  const previousFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const query = buildQuery({
    from: from.toISOString(),
    to: to.toISOString(),
    previousFrom: previousFrom.toISOString(),
  });
  return request<HomeSummary>(`/home${query}`, { auth: true });
}
