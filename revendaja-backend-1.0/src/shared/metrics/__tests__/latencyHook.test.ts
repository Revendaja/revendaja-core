import { buildApp } from '../../../app';
import { UNMATCHED_ROUTE, latencyTracker } from '../latency';

// O servidor de verdade registra o tempo de cada resposta, agrupado pelo MODELO da rota.
async function inject(
  method: 'GET' | 'OPTIONS',
  url: string,
  headers: Record<string, string> = {},
) {
  const app = await buildApp();
  try {
    return await app.inject({ method, url, headers });
  } finally {
    await app.close();
  }
}

beforeEach(() => latencyTracker.clear());

describe('medição de latência no servidor', () => {
  it('agrupa pelo modelo da rota, não pela URL (um id diferente não cria outra linha)', async () => {
    await inject('GET', '/sales/3fa85f64-5717-4562-b3fc-2c963f66afa6');
    await inject('GET', '/sales/8c5f7a52-1a0f-4a45-9a52-3d0a9f1b2c11');

    const stats = latencyTracker.snapshot();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ method: 'GET', route: '/sales/:id', count: 2 });
    // Sem login: 401, contado como erro do pedido (não do servidor).
    expect(stats[0].clientErrors).toBe(2);
    expect(stats[0].serverErrors).toBe(0);
  });

  it('URLs inexistentes aparecem todas sob um nome só (não enchem a memória)', async () => {
    await inject('GET', '/nao-existe-1');
    await inject('GET', '/nao-existe-2');
    await inject('GET', '/outra/coisa');

    const stats = latencyTracker.snapshot();
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ route: UNMATCHED_ROUTE, count: 3 });
  });

  it('o pré-voo do CORS não entra na conta', async () => {
    await inject('OPTIONS', '/sales', {
      origin: 'https://app.revendaja.com',
      'access-control-request-method': 'POST',
    });
    expect(latencyTracker.snapshot()).toEqual([]);
  });

  it('as rotas do próprio painel de administração não entram na conta', async () => {
    await inject('GET', '/admin/overview');
    expect(latencyTracker.snapshot()).toEqual([]);
  });

  it('guarda tempos reais (maiores ou iguais a zero)', async () => {
    await inject('GET', '/nao-existe');
    const [stats] = latencyTracker.snapshot();
    expect(stats.p95Ms).toBeGreaterThanOrEqual(0);
    expect(stats.maxMs).toBeLessThan(5000);
  });
});
