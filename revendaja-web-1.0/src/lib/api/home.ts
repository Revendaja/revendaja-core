import { request } from './http';
import { buildQuery, monthRange } from '../utils/dates';
import type { HomeSummary } from './types';

// Tudo da tela Início numa chamada. O período é o mês de `now` (from inclusivo, to exclusivo);
// `previousFrom` é o início do mês anterior, só para calcular o crescimento.
export function getHome(now: Date) {
  const { from, to } = monthRange(now.getMonth(), now);
  const previousFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const query = buildQuery({
    from: from.toISOString(),
    to: to.toISOString(),
    previousFrom: previousFrom.toISOString(),
  });
  return request<HomeSummary>(`/home${query}`, { auth: true });
}
