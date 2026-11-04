import { LatencyTracker, UNMATCHED_ROUTE, percentile } from '../latency';

const MIN = 60_000;

describe('percentile', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100

  it('calcula p50, p95 e p99 pelo posto mais próximo', () => {
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 99)).toBe(99);
    expect(percentile(values, 100)).toBe(100);
  });

  it('lida com poucos valores e com lista vazia', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([42], 99)).toBe(42);
    expect(percentile([10, 20], 50)).toBe(10);
  });
});

describe('LatencyTracker', () => {
  it('resume uma rota: volume, média, percentis e erros', () => {
    const tracker = new LatencyTracker();
    const now = 1_000_000;
    for (let i = 1; i <= 100; i++) tracker.record('GET', '/sales', i, 200, now);
    tracker.record('GET', '/sales', 500, 500, now);
    tracker.record('GET', '/sales', 30, 404, now);

    const [stats] = tracker.snapshot(now);
    expect(stats).toMatchObject({
      method: 'GET',
      route: '/sales',
      count: 102,
      serverErrors: 1,
      clientErrors: 1,
      maxMs: 500,
    });
    // 102 medidas: o p95 é a de posto 97 na ordem crescente.
    expect(stats.p95Ms).toBeGreaterThan(90);
    expect(stats.p50Ms).toBeGreaterThan(40);
    expect(stats.p50Ms).toBeLessThan(60);
  });

  it('separa rotas e métodos diferentes e ordena da mais lenta (p95) para a mais rápida', () => {
    const tracker = new LatencyTracker();
    tracker.record('GET', '/rapida', 5, 200);
    tracker.record('POST', '/ai/chat', 4000, 200);
    tracker.record('GET', '/media', 300, 200);

    expect(tracker.snapshot().map((item) => `${item.method} ${item.route}`)).toEqual([
      'POST /ai/chat',
      'GET /media',
      'GET /rapida',
    ]);
  });

  it('ignora medidas fora da janela de tempo', () => {
    const tracker = new LatencyTracker(10 * MIN);
    const now = 100 * MIN;
    tracker.record('GET', '/antiga', 900, 200, now - 30 * MIN);
    tracker.record('GET', '/nova', 20, 200, now - 1 * MIN);

    const routes = tracker.snapshot(now).map((item) => item.route);
    expect(routes).toEqual(['/nova']);
  });

  it('guarda no máximo N medidas por rota, descartando as mais antigas', () => {
    const tracker = new LatencyTracker(MIN * 60, 50);
    for (let i = 1; i <= 200; i++) tracker.record('GET', '/x', i, 200);

    const [stats] = tracker.snapshot();
    expect(stats.count).toBe(50);
    // Sobraram só as 50 mais recentes (151 a 200).
    expect(stats.p50Ms).toBeGreaterThan(150);
  });

  it('limita a quantidade de rotas guardadas (não cresce sem fim)', () => {
    const tracker = new LatencyTracker(MIN * 60, 10, 3);
    for (let i = 0; i < 20; i++) tracker.record('GET', `/rota-${i}`, 10, 200);

    expect(tracker.snapshot()).toHaveLength(3);
  });

  it('rota inexistente usa um nome fixo (URLs aleatórias não viram rotas)', () => {
    expect(UNMATCHED_ROUTE).toBe('(rota inexistente)');
  });

  it('clear zera tudo', () => {
    const tracker = new LatencyTracker();
    tracker.record('GET', '/x', 10, 200);
    tracker.clear();
    expect(tracker.snapshot()).toEqual([]);
  });
});
