// Como classificar o tempo de resposta de uma rota para o painel (verde, amarelo ou vermelho).

export type LatencyTone = 'good' | 'warn' | 'bad';

export interface LatencyLevel {
  tone: LatencyTone;
  label: string;
}

// Rotas que chamam a OpenAI levam segundos por natureza (o modelo pensa e consulta o banco): usam
// limites bem maiores, senão estariam sempre "vermelhas" sem haver problema.
const SLOW_BY_DESIGN = new Set(['/ai/chat', '/ai/transcribe']);

const NORMAL_LIMITS = { good: 300, warn: 1000 };
const AI_LIMITS = { good: 8000, warn: 20000 };

export function isSlowByDesign(route: string): boolean {
  return SLOW_BY_DESIGN.has(route);
}

// Avalia pelo p95: 95% das chamadas foram mais rápidas que ele, então reflete a experiência de quase
// todo mundo sem se deixar enganar por uma única chamada lenta.
export function classifyLatency(route: string, p95Ms: number): LatencyLevel {
  const limits = isSlowByDesign(route) ? AI_LIMITS : NORMAL_LIMITS;
  if (p95Ms < limits.good) return { tone: 'good', label: 'Rápida' };
  if (p95Ms < limits.warn) return { tone: 'warn', label: 'Atenção' };
  return { tone: 'bad', label: 'Lenta' };
}

export function formatMs(ms: number): string {
  if (ms >= 10_000) return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} s`;
  if (ms >= 1000) return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
  return `${Math.round(ms).toLocaleString('pt-BR')} ms`;
}

// "5xx" sobre o total de pedidos, em %. Sem pedidos não há taxa.
export function errorRatePercent(serverErrors: number, requests: number): number | null {
  return requests > 0 ? (serverErrors / requests) * 100 : null;
}
