import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const storeFindUnique = jest.fn();
const saleGroupBy = jest.fn();
const saleCount = jest.fn();
const saleItemFindMany = jest.fn();
const storeProductCount = jest.fn();
const storeProductFindMany = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: { findUnique: (...args: unknown[]) => sessionFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    store: { findUnique: (...args: unknown[]) => storeFindUnique(...args) },
    sale: {
      groupBy: (...args: unknown[]) => saleGroupBy(...args),
      count: (...args: unknown[]) => saleCount(...args),
    },
    saleItem: { findMany: (...args: unknown[]) => saleItemFindMany(...args) },
    storeProduct: {
      count: (...args: unknown[]) => storeProductCount(...args),
      findMany: (...args: unknown[]) => storeProductFindMany(...args),
    },
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const TOKEN = signTestAccessToken(USER_ID);
const PRODUCT_A = '22222222-2222-4222-8222-222222222222';
const PRODUCT_B = '33333333-3333-4333-8333-333333333333';

const FROM = '2026-09-01T03:00:00.000Z';
const TO = '2026-10-01T03:00:00.000Z';
const PREVIOUS_FROM = '2026-08-01T03:00:00.000Z';
const QUERY = `?from=${FROM}&to=${TO}&previousFrom=${PREVIOUS_FROM}`;

const money = (value: number) => ({ toNumber: () => value });

const OWN_STORE = {
  id: 'store-1',
  userId: USER_ID,
  storeName: 'Leal Perfumaria',
  handle: 'lealperfumaria',
  catalogLink: 'https://lealperfumaria.revendaja.com',
  isOnline: true,
  createdAt: new Date(),
};

function buildUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// A mesma tabela `stores` é lida de dois jeitos: a loja da usuária (where.userId) e só a
// meta + plano (where.id + select).
function arrangeStore(
  monthlyGoal: number | null,
  plan: 'free' | 'starter' | 'premium' | 'business' = 'free',
) {
  userFindUnique.mockResolvedValue(buildUserRow());
  storeFindUnique.mockImplementation(({ where }: { where: { userId?: string } }) =>
    Promise.resolve(
      where.userId
        ? OWN_STORE
        : {
            monthlyGoal: monthlyGoal === null ? null : money(monthlyGoal),
            plan,
            acceptedPaymentMethods: ['pix', 'card', 'cash'],
            hideOutOfStock: true,
          },
    ),
  );
}

// `groupBy` é chamado para o período atual e para o anterior: responde pelo `from`.
function arrangeSales({
  current,
  previous,
}: {
  current: { paid?: number; pending?: number };
  previous: { paid?: number; pending?: number };
}) {
  const rows = ({ paid, pending }: { paid?: number; pending?: number }) => [
    ...(paid === undefined ? [] : [{ status: 'paid', _sum: { total: money(paid) } }]),
    ...(pending === undefined ? [] : [{ status: 'pending', _sum: { total: money(pending) } }]),
  ];
  saleGroupBy.mockImplementation(({ where }: { where: { createdAt: { gte: Date } } }) =>
    Promise.resolve(where.createdAt.gte.toISOString() === FROM ? rows(current) : rows(previous)),
  );
}

async function request(url: string, token: string | null = TOKEN) {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  await app.close();
  return response;
}

beforeEach(() => {
  [
    sessionFindUnique,
    userFindUnique,
    storeFindUnique,
    saleGroupBy,
    saleCount,
    saleItemFindMany,
    storeProductCount,
    storeProductFindMany,
  ].forEach((mock) => mock.mockReset());

  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  arrangeStore(null);
  arrangeSales({ current: {}, previous: {} });
  saleCount.mockResolvedValue(0);
  saleItemFindMany.mockResolvedValue([]);
  storeProductCount.mockResolvedValue(0);
  storeProductFindMany.mockResolvedValue([]);
});

describe('acesso a GET /home', () => {
  it('retorna 401 sem token', async () => {
    const response = await request(`/home${QUERY}`, null);

    expect(response.statusCode).toBe(401);
  });

  it('retorna 403 quando o e-mail ainda não foi verificado', async () => {
    userFindUnique.mockResolvedValue(buildUserRow({ phoneVerifiedAt: null }));

    const response = await request(`/home${QUERY}`);

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe('Confirme seu e-mail antes de gerenciar a loja.');
  });

  it('retorna 404 "Você ainda não possui uma loja." quando não há loja', async () => {
    storeFindUnique.mockResolvedValue(null);

    const response = await request(`/home${QUERY}`);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Você ainda não possui uma loja.');
  });
});

describe('GET /home', () => {
  it('devolve o payload da tela: plano, faturamento, crescimento, meta e alertas', async () => {
    arrangeStore(5000, 'starter');
    arrangeSales({
      // O que está pendente (250,50) não entra no faturamento; só o que foi pago.
      current: { paid: 4250.5, pending: 250.5 },
      previous: { paid: 2950, pending: 800 },
    });
    saleCount.mockResolvedValue(3);
    storeProductCount.mockResolvedValue(7);
    storeProductFindMany.mockResolvedValue([
      { id: PRODUCT_A, stock: 0, product: { name: 'Kaiak Aventura 100 ml' } },
      { id: PRODUCT_B, stock: 4, product: { name: 'Essencial Exclusivo' } },
    ]);

    const response = await request(`/home${QUERY}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      plan: { id: 'starter', name: 'Inicial' },
      revenue: {
        total: 4250.5,
        growthPercent: 44.08,
      },
      goal: { target: 5000, percent: 85.01, remaining: 749.5 },
      alerts: {
        lowStock: {
          threshold: 25,
          count: 7,
          products: [
            { storeProductId: PRODUCT_A, name: 'Kaiak Aventura 100 ml', stock: 0 },
            { storeProductId: PRODUCT_B, name: 'Essencial Exclusivo', stock: 4 },
          ],
        },
        pendingSales: { count: 3 },
      },
    });
  });

  it('loja nova, sem nada: zeros, sem meta, sem crescimento e sem alertas', async () => {
    const response = await request(`/home${QUERY}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      plan: { id: 'free', name: 'Gratuito' },
      revenue: { total: 0, growthPercent: null },
      goal: null,
      alerts: {
        lowStock: { threshold: 25, count: 0, products: [] },
        pendingSales: { count: 0 },
      },
    });
  });

  it('o faturamento conta SÓ vendas pagas (o fiado pendente fica de fora)', async () => {
    arrangeSales({ current: { paid: 300, pending: 125.5 }, previous: {} });

    const response = await request(`/home${QUERY}`);

    expect(response.json().revenue.total).toBe(300);
  });

  it('loja recém-criada começa no plano Gratuito', async () => {
    const response = await request(`/home${QUERY}`);

    expect(response.json().plan).toEqual({ id: 'free', name: 'Gratuito' });
  });

  it('não traz lucro, margem nem custo, e nem consulta os itens vendidos (a tela não mostra)', async () => {
    arrangeSales({ current: { paid: 100 }, previous: {} });

    const response = await request(`/home${QUERY}`);

    expect(response.json().revenue).toEqual({ total: 100, growthPercent: null });
    expect(JSON.stringify(response.json())).not.toMatch(/profit|margin|cost/i);
    expect(saleItemFindMany).not.toHaveBeenCalled();
  });

  it('período atual e anterior são consultados só na loja da usuária ([from, to) e [previousFrom, from))', async () => {
    await request(`/home${QUERY}`);

    const wheres = saleGroupBy.mock.calls.map(([args]) => args.where);
    expect(wheres).toEqual(
      expect.arrayContaining([
        { storeId: 'store-1', createdAt: { gte: new Date(FROM), lt: new Date(TO) } },
        { storeId: 'store-1', createdAt: { gte: new Date(PREVIOUS_FROM), lt: new Date(FROM) } },
      ]),
    );
    expect(wheres).toHaveLength(2);
  });

  it('vendas pendentes contam de QUALQUER período (uma venda antiga a receber continua a receber)', async () => {
    await request(`/home${QUERY}`);

    expect(saleCount).toHaveBeenCalledTimes(1);
    expect(saleCount.mock.calls[0][0].where).toEqual({ storeId: 'store-1', status: 'pending' });
  });

  it('estoque baixo: só da loja, até 25 un., esgotados inclusive, mais críticos primeiro (5 nomes)', async () => {
    await request(`/home${QUERY}`);

    const where = { storeId: 'store-1', stock: { lte: 25 } };
    expect(storeProductCount.mock.calls[0][0].where).toEqual(where);
    expect(storeProductFindMany.mock.calls[0][0]).toMatchObject({
      where,
      // Produto manual não tem `product` pra ordenar pelo nome do catálogo: a ordem estável fica só
      // por estoque e, no empate, por id (ver store.repository#findLowStock).
      orderBy: [{ stock: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  });

  it('lê meta, plano e configurações da loja pelo id, numa consulta só', async () => {
    await request(`/home${QUERY}`);

    expect(storeFindUnique).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      select: {
        monthlyGoal: true,
        plan: true,
        acceptedPaymentMethods: true,
        hideOutOfStock: true,
      },
    });
  });

  it('aceita datas com offset (fuso do aparelho) e converte para o mesmo instante', async () => {
    await request(
      '/home?from=2026-09-01T00:00:00-03:00&to=2026-10-01T00:00:00-03:00&previousFrom=2026-08-01T00:00:00-03:00',
    );

    const wheres = saleGroupBy.mock.calls.map(([args]) => args.where.createdAt.gte);
    expect(wheres).toEqual(expect.arrayContaining([new Date(FROM), new Date(PREVIOUS_FROM)]));
  });

  it.each([
    ['sem nenhum parâmetro', ''],
    ['sem previousFrom', `?from=${FROM}&to=${TO}`],
    ['sem to', `?from=${FROM}&previousFrom=${PREVIOUS_FROM}`],
    ['sem from', `?to=${TO}&previousFrom=${PREVIOUS_FROM}`],
    ['data que não é ISO-8601', `?from=ontem&to=${TO}&previousFrom=${PREVIOUS_FROM}`],
    ['data sem horário', `?from=2026-09-01&to=${TO}&previousFrom=${PREVIOUS_FROM}`],
    ['from depois de to', `?from=${TO}&to=${FROM}&previousFrom=${PREVIOUS_FROM}`],
    ['from igual a to', `?from=${FROM}&to=${FROM}&previousFrom=${PREVIOUS_FROM}`],
    ['previousFrom depois de from', `?from=${FROM}&to=${TO}&previousFrom=${TO}`],
    ['previousFrom igual a from', `?from=${FROM}&to=${TO}&previousFrom=${FROM}`],
  ])('retorna 400 %s (o período é obrigatório e precisa fazer sentido)', async (_label, query) => {
    const response = await request(`/home${query}`);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(saleGroupBy).not.toHaveBeenCalled();
  });
});
