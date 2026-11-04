// Medidor de latência por rota, em memória. Guarda os tempos de resposta recentes de cada rota e
// calcula percentis (p50, p95, p99), taxa de erro e volume numa janela de tempo.
//
// Limites assumidos de propósito: vive na memória de UMA máquina (reinicia zerado e, com várias
// máquinas, cada uma tem o seu), e guarda no máximo `maxSamples` medidas por rota. Para histórico
// de dias, alertas e várias máquinas juntas, o caminho é exportar para uma ferramenta de métricas
// (Prometheus/Grafana, Datadog...), que é o que empresas grandes usam.

export interface LatencySample {
  at: number;
  ms: number;
  status: number;
}

export interface RouteStats {
  method: string;
  route: string;
  count: number;
  // Respostas 5xx (falha do servidor) e 4xx (erro do pedido, ex.: 401, 404, 409).
  serverErrors: number;
  clientErrors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  lastAt: number;
}

export const UNMATCHED_ROUTE = '(rota inexistente)';

// Percentil pelo método do "posto mais próximo": o p95 é o menor valor que cobre 95% das medidas.
export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const rank = Math.max(1, Math.ceil((p / 100) * sortedAscending.length));
  return sortedAscending[Math.min(rank, sortedAscending.length) - 1];
}

export class LatencyTracker {
  private readonly routes = new Map<string, LatencySample[]>();

  constructor(
    private readonly windowMs = 60 * 60 * 1000,
    private readonly maxSamples = 2000,
    private readonly maxRoutes = 300,
  ) {}

  record(method: string, route: string, ms: number, status: number, now = Date.now()): void {
    const key = `${method} ${route}`;
    let samples = this.routes.get(key);
    if (!samples) {
      // Defesa: nunca guarda mais rotas do que o limite (evita crescer sem fim).
      if (this.routes.size >= this.maxRoutes) return;
      samples = [];
      this.routes.set(key, samples);
    }
    samples.push({ at: now, ms, status });
    if (samples.length > this.maxSamples) samples.splice(0, samples.length - this.maxSamples);
  }

  // Estatísticas das medidas dentro da janela, da rota mais lenta (p95) para a mais rápida.
  snapshot(now = Date.now()): RouteStats[] {
    const since = now - this.windowMs;
    const stats: RouteStats[] = [];

    for (const [key, samples] of this.routes) {
      const recent = samples.filter((sample) => sample.at >= since);
      if (recent.length === 0) continue;

      const times = recent.map((sample) => sample.ms).sort((a, b) => a - b);
      const separator = key.indexOf(' ');
      stats.push({
        method: key.slice(0, separator),
        route: key.slice(separator + 1),
        count: recent.length,
        serverErrors: recent.filter((sample) => sample.status >= 500).length,
        clientErrors: recent.filter((sample) => sample.status >= 400 && sample.status < 500).length,
        avgMs: times.reduce((sum, value) => sum + value, 0) / times.length,
        p50Ms: percentile(times, 50),
        p95Ms: percentile(times, 95),
        p99Ms: percentile(times, 99),
        maxMs: times[times.length - 1],
        lastAt: recent[recent.length - 1].at,
      });
    }

    return stats.sort((a, b) => b.p95Ms - a.p95Ms);
  }

  get windowMinutes(): number {
    return Math.round(this.windowMs / 60_000);
  }

  clear(): void {
    this.routes.clear();
  }
}

export const latencyTracker = new LatencyTracker();
