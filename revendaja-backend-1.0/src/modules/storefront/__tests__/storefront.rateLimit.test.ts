const storeFindUnique = jest.fn();
const storeVisitCreate = jest.fn();
const storeProductFindMany = jest.fn();
const storeProductCount = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    store: { findUnique: (...args: unknown[]) => storeFindUnique(...args) },
    storeVisit: { create: (...args: unknown[]) => storeVisitCreate(...args) },
    storeProduct: {
      findMany: (...args: unknown[]) => storeProductFindMany(...args),
      count: (...args: unknown[]) => storeProductCount(...args),
    },
  },
}));

import { buildApp } from '../../../app';
import type * as AppModule from '../../../app';

const STORE = {
  id: 'store-1',
  userId: 'user-1',
  storeName: 'Leal Perfumaria',
  handle: 'lealperfumaria',
  catalogLink: 'https://lealperfumaria.revendaja.com',
  isOnline: true,
  bio: null,
  createdAt: new Date(),
};

beforeEach(() => {
  [storeFindUnique, storeVisitCreate, storeProductFindMany, storeProductCount].forEach((mock) =>
    mock.mockReset(),
  );
  storeVisitCreate.mockResolvedValue({});
  storeProductFindMany.mockResolvedValue([]);
  storeProductCount.mockResolvedValue(0);
  storeFindUnique.mockImplementation(({ where }: { where: { handle?: string; id?: string } }) =>
    Promise.resolve(
      where.handle
        ? STORE
        : {
            monthlyGoal: null,
            plan: 'free',
            acceptedPaymentMethods: ['pix', 'card', 'cash'],
            hideOutOfStock: true,
          },
    ),
  );
});

type App = Awaited<ReturnType<typeof buildApp>>;

// Vários pedidos no MESMO app: o limite mora na memória da instância.
async function repeat(
  app: App,
  times: number,
  options: { method: 'GET' | 'POST'; url: string; payload?: Record<string, unknown> },
  extra: { remoteAddress?: string; headers?: Record<string, string> } = {},
) {
  const statuses: number[] = [];
  let last: Awaited<ReturnType<App['inject']>> | undefined;
  for (let i = 0; i < times; i += 1) {
    last = await app.inject({ ...options, ...extra });
    statuses.push(last.statusCode);
  }
  return { statuses, last: last as NonNullable<typeof last> };
}

const VISIT = { method: 'POST', url: '/public/stores/lealperfumaria/visits' } as const;
const STOREFRONT = { method: 'GET', url: '/public/stores/lealperfumaria' } as const;
const ORDER = { method: 'POST', url: '/public/stores/lealperfumaria/orders', payload: {} } as const;

describe('limite de requisições das rotas públicas (por IP)', () => {
  it('visitas: passa até 30 por minuto e a 31ª leva 429', async () => {
    const app = await buildApp();

    const { statuses } = await repeat(app, 31, VISIT);

    expect(statuses.slice(0, 30).every((status) => status === 204)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(storeVisitCreate).toHaveBeenCalledTimes(30);
    await app.close();
  });

  it('a resposta 429 usa o formato de erro da API e manda Retry-After', async () => {
    const app = await buildApp();

    const { last } = await repeat(app, 31, VISIT);

    expect(last.statusCode).toBe(429);
    expect(last.json()).toEqual({
      error: 'TOO_MANY_REQUESTS',
      message: expect.stringMatching(/^Muitas requisições\. Tente novamente em \d+ segundos\.$/),
    });
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(last.headers['retry-after'])).toBeLessThanOrEqual(60);
    await app.close();
  });

  it('a visita barrada NÃO chega ao banco (nem à consulta da loja)', async () => {
    const app = await buildApp();
    await repeat(app, 30, VISIT);
    storeFindUnique.mockClear();
    storeVisitCreate.mockClear();

    const { last } = await repeat(app, 1, VISIT);

    expect(last.statusCode).toBe(429);
    expect(storeFindUnique).not.toHaveBeenCalled();
    expect(storeVisitCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('o limite é POR IP: outro IP segue passando', async () => {
    const app = await buildApp();
    await repeat(app, 31, VISIT, { remoteAddress: '10.0.0.1' });

    const { last } = await repeat(app, 1, VISIT, { remoteAddress: '10.0.0.2' });

    expect(last.statusCode).toBe(204);
    await app.close();
  });

  it('cada rota tem o seu contador: estourar visitas não bloqueia a vitrine', async () => {
    const app = await buildApp();
    await repeat(app, 31, VISIT);

    const { last } = await repeat(app, 1, STOREFRONT);

    expect(last.statusCode).toBe(200);
    await app.close();
  });

  it('vitrine: até 120 por minuto, a 121ª leva 429', async () => {
    const app = await buildApp();

    const { statuses } = await repeat(app, 121, STOREFRONT);

    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
    await app.close();
  });

  it('pedidos: limite mais apertado, 10 por hora (tentativa inválida também conta)', async () => {
    const app = await buildApp();

    const { statuses } = await repeat(app, 11, ORDER);

    // Corpo vazio = 400 de validação; o limite roda ANTES da validação, então robô sem corpo também é contido.
    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    await app.close();
  });

  it('rotas autenticadas do app NÃO são limitadas', async () => {
    const app = await buildApp();

    const { statuses } = await repeat(app, 150, { method: 'GET', url: '/store/stats' });

    expect(statuses.every((status) => status === 401)).toBe(true);
    await app.close();
  });

  it('sem TRUST_PROXY, o X-Forwarded-For é IGNORADO (ninguém burla o limite forjando o IP)', async () => {
    const app = await buildApp();
    const statuses: number[] = [];

    for (let i = 0; i < 31; i += 1) {
      const response = await app.inject({
        ...VISIT,
        headers: { 'x-forwarded-for': `203.0.113.${i}` },
      });
      statuses.push(response.statusCode);
    }

    expect(statuses[30]).toBe(429);
    await app.close();
  });

  it('com TRUST_PROXY=true (proxy confiável), o limite conta pelo IP do cliente no X-Forwarded-For', async () => {
    const previous = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = 'true';
    try {
      await jest.isolateModulesAsync(async () => {
        // `require` de propósito: precisa carregar o app (e o env) de novo, já com TRUST_PROXY ligado.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { buildApp: buildTrustingApp } = require('../../../app') as typeof AppModule;
        const app = await buildTrustingApp();

        // 31 pedidos de UM cliente atrás do proxy: o 31º é barrado.
        const sameClient: number[] = [];
        for (let i = 0; i < 31; i += 1) {
          const response = await app.inject({
            ...VISIT,
            headers: { 'x-forwarded-for': '203.0.113.7' },
          });
          sameClient.push(response.statusCode);
        }
        expect(sameClient[30]).toBe(429);

        // Outro cliente atrás do MESMO proxy não é punido pelo primeiro.
        const other = await app.inject({ ...VISIT, headers: { 'x-forwarded-for': '203.0.113.8' } });
        expect(other.statusCode).toBe(204);
        await app.close();
      });
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previous;
    }
  });
});
