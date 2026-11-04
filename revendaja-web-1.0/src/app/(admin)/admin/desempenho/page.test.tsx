import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithQuery } from '@/test/utils';
import type { AdminLatency, AdminRouteStats } from '@/lib/api/admin';
import { classifyLatency, errorRatePercent, formatMs, isSlowByDesign } from '@/lib/admin/latency';
import AdminPerformancePage from './page';

const mocks = vi.hoisted(() => ({ latency: vi.fn() }));
vi.mock('@/lib/api/admin', () => ({ getAdminLatency: () => mocks.latency() }));

function route(overrides: Partial<AdminRouteStats>): AdminRouteStats {
  return {
    method: 'GET',
    route: '/sales',
    count: 100,
    serverErrors: 0,
    clientErrors: 0,
    avgMs: 50,
    p50Ms: 40,
    p95Ms: 120,
    p99Ms: 200,
    maxMs: 300,
    lastAt: Date.now(),
    ...overrides,
  };
}

function latency(routes: AdminRouteStats[], overrides: Partial<AdminLatency> = {}): AdminLatency {
  return {
    generatedAt: new Date().toISOString(),
    windowMinutes: 60,
    uptimeSeconds: 3600,
    requests: routes.reduce((sum, item) => sum + item.count, 0),
    serverErrors: routes.reduce((sum, item) => sum + item.serverErrors, 0),
    routes,
    db: { medianMs: 20, samplesMs: [18, 20, 25] },
    ...overrides,
  };
}

beforeEach(() => mocks.latency.mockReset());

describe('classificação da latência', () => {
  it('rotas normais: verde abaixo de 300 ms, amarelo até 1 s, vermelho acima', () => {
    expect(classifyLatency('/sales', 120).tone).toBe('good');
    expect(classifyLatency('/sales', 299).tone).toBe('good');
    expect(classifyLatency('/sales', 300).tone).toBe('warn');
    expect(classifyLatency('/sales', 999).tone).toBe('warn');
    expect(classifyLatency('/sales', 1000).tone).toBe('bad');
  });

  it('as rotas do assistente de IA usam limites bem maiores (levam segundos por natureza)', () => {
    expect(isSlowByDesign('/ai/chat')).toBe(true);
    expect(classifyLatency('/ai/chat', 4000).tone).toBe('good');
    expect(classifyLatency('/ai/chat', 12_000).tone).toBe('warn');
    expect(classifyLatency('/ai/chat', 25_000).tone).toBe('bad');
    expect(isSlowByDesign('/sales')).toBe(false);
  });

  it('formata milissegundos e segundos', () => {
    expect(formatMs(85)).toBe('85 ms');
    expect(formatMs(1500)).toBe('1,5 s');
    expect(formatMs(12_000)).toBe('12 s');
  });

  it('taxa de erro', () => {
    expect(errorRatePercent(5, 100)).toBe(5);
    expect(errorRatePercent(0, 0)).toBeNull();
  });
});

describe('página Desempenho', () => {
  it('mostra as rotas da mais lenta para a mais rápida, com a situação de cada uma', async () => {
    mocks.latency.mockResolvedValue(
      latency([
        route({ route: '/store/products', p95Ms: 1400, p50Ms: 600, p99Ms: 2000, maxMs: 2500 }),
        route({ route: '/sales', p95Ms: 120 }),
      ]),
    );
    renderWithQuery(<AdminPerformancePage />);

    expect(await screen.findByText('/store/products')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('/store/products')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Lenta')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Rápida')).toBeInTheDocument();
    expect(screen.getByText(/1 rota\(s\) mais lentas que o ideal: \/store\/products/)).toBeInTheDocument();
  });

  it('destaca falhas do servidor (5xx) e a taxa de erro', async () => {
    mocks.latency.mockResolvedValue(latency([route({ route: '/sales', count: 200, serverErrors: 4 })]));
    renderWithQuery(<AdminPerformancePage />);

    expect(await screen.findByText(/1 rota\(s\) com falha do servidor/)).toBeInTheDocument();
    expect(screen.getByText('4 erro(s) 5xx')).toBeInTheDocument();
    expect(screen.getByText('2,00%')).toBeInTheDocument();
  });

  it('explica que o assistente de IA é lento por natureza', async () => {
    mocks.latency.mockResolvedValue(latency([route({ method: 'POST', route: '/ai/chat', p95Ms: 5000 })]));
    renderWithQuery(<AdminPerformancePage />);

    expect(await screen.findByText(/chama a OpenAI: leva segundos por natureza/)).toBeInTheDocument();
    expect(screen.getByText('Rápida')).toBeInTheDocument();
    expect(screen.getByText(/Todas as rotas estão respondendo rápido e sem falhas/)).toBeInTheDocument();
  });

  it('sem pedidos ainda, avisa que a medição recomeça a cada deploy', async () => {
    mocks.latency.mockResolvedValue(latency([]));
    renderWithQuery(<AdminPerformancePage />);

    expect(await screen.findByText(/Ainda não há pedidos medidos/)).toBeInTheDocument();
  });

  it('mostra a latência do banco, e avisa quando ele não responde', async () => {
    mocks.latency.mockResolvedValue(latency([route({})], { db: { medianMs: null, samplesMs: [-1, -1, -1] } }));
    renderWithQuery(<AdminPerformancePage />);

    expect(await screen.findByText('sem resposta')).toBeInTheDocument();
  });
});
