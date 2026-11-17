import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const storeFindUnique = jest.fn();
const couponFindMany = jest.fn();
const couponFindFirst = jest.fn();
const couponFindUnique = jest.fn();
const couponCreate = jest.fn();
const couponUpdateMany = jest.fn();
const couponDeleteMany = jest.fn();
const storeProductFindMany = jest.fn();
const queryRaw = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: { findUnique: (...args: unknown[]) => sessionFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    store: { findUnique: (...args: unknown[]) => storeFindUnique(...args) },
    coupon: {
      findMany: (...args: unknown[]) => couponFindMany(...args),
      findFirst: (...args: unknown[]) => couponFindFirst(...args),
      findUnique: (...args: unknown[]) => couponFindUnique(...args),
      create: (...args: unknown[]) => couponCreate(...args),
      updateMany: (...args: unknown[]) => couponUpdateMany(...args),
      deleteMany: (...args: unknown[]) => couponDeleteMany(...args),
    },
    storeProduct: { findMany: (...args: unknown[]) => storeProductFindMany(...args) },
    $queryRaw: async (...args: unknown[]) =>
      sessionHelpers.sessionAwareQueryRaw(sessionFindUnique, userFindUnique, queryRaw, args),
  },
}));

import * as sessionHelpers from '../../../../test/helpers/session';
import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const TOKEN = signTestAccessToken(USER_ID);
const COUPON_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_A = '22222222-2222-4222-8222-222222222222';

const money = (value: number) => ({ toNumber: () => value });

const STORE = {
  id: 'store-1',
  userId: USER_ID,
  storeName: 'Leal Perfumaria',
  handle: 'lealperfumaria',
  catalogLink: 'https://lealperfumaria.revendaja.com',
  isOnline: true,
  plan: 'free',
  createdAt: new Date(),
};

function userRow() {
  return {
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    createdAt: new Date(),
  };
}

function couponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COUPON_ID,
    storeId: 'store-1',
    code: 'VERAO10',
    type: 'percent',
    value: money(10),
    minOrder: null,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    isActive: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function arrangeOwner() {
  userFindUnique.mockResolvedValue(userRow());
  storeFindUnique.mockResolvedValue(STORE);
}

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
  token: string | null = TOKEN,
) {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload,
  });
  await app.close();
  return response;
}

beforeEach(() => {
  [
    sessionFindUnique,
    userFindUnique,
    storeFindUnique,
    couponFindMany,
    couponFindFirst,
    couponFindUnique,
    couponCreate,
    couponUpdateMany,
    couponDeleteMany,
    storeProductFindMany,
    queryRaw,
  ].forEach((mock) => mock.mockReset());
  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
});

describe('cupons da loja (painel)', () => {
  it.each([
    ['GET', '/store/coupons'],
    ['POST', '/store/coupons'],
    ['PATCH', `/store/coupons/${COUPON_ID}`],
    ['DELETE', `/store/coupons/${COUPON_ID}`],
  ] as const)('%s %s sem token: 401', async (method, url) => {
    const body =
      method === 'POST'
        ? { code: 'ABC', type: 'percent', value: 10 }
        : method === 'PATCH'
          ? { isActive: false }
          : undefined;

    const response = await call(method, url, body, null);

    expect(response.statusCode).toBe(401);
  });

  it('lista os cupons da loja, escopados por storeId', async () => {
    arrangeOwner();
    couponFindMany.mockResolvedValue([
      couponRow(),
      couponRow({
        id: '66666666-6666-4666-8666-666666666666',
        code: 'FRETE20',
        type: 'fixed',
        value: money(20),
        minOrder: money(100),
        maxUses: 5,
        usedCount: 2,
      }),
    ]);

    const response = await call('GET', '/store/coupons');

    expect(response.statusCode).toBe(200);
    expect(couponFindMany.mock.calls[0][0].where).toEqual({ storeId: 'store-1' });
    expect(response.json().items[1]).toMatchObject({
      code: 'FRETE20',
      type: 'fixed',
      value: 20,
      minOrder: 100,
      maxUses: 5,
      usedCount: 2,
      isActive: true,
    });
  });

  it('cria um cupom: código em maiúsculas, sem espaços, na loja da usuária', async () => {
    arrangeOwner();
    couponCreate.mockResolvedValue(couponRow({ code: 'VERAO10' }));

    const response = await call('POST', '/store/coupons', {
      code: ' verao10 ',
      type: 'percent',
      value: 10,
      minOrder: 50,
      maxUses: 100,
    });

    expect(response.statusCode).toBe(201);
    expect(couponCreate.mock.calls[0][0].data).toEqual({
      storeId: 'store-1',
      code: 'VERAO10',
      type: 'percent',
      value: 10,
      minOrder: 50,
      maxUses: 100,
      expiresAt: null,
    });
  });

  it('código repetido na loja: 409', async () => {
    arrangeOwner();
    couponCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    const response = await call('POST', '/store/coupons', {
      code: 'VERAO10',
      type: 'percent',
      value: 10,
    });

    expect(response.statusCode).toBe(409);
  });

  it.each([
    ['percentual acima de 100', { code: 'ABC', type: 'percent', value: 120 }],
    ['valor zero', { code: 'ABC', type: 'fixed', value: 0 }],
    ['código curto demais', { code: 'AB', type: 'fixed', value: 5 }],
    ['código com caractere inválido', { code: 'VER@O', type: 'fixed', value: 5 }],
    ['tipo desconhecido', { code: 'ABC', type: 'frete', value: 5 }],
    ['limite de usos zero', { code: 'ABC', type: 'fixed', value: 5, maxUses: 0 }],
  ])('cria: %s é 400 sem tocar no banco', async (_name, body) => {
    arrangeOwner();

    const response = await call('POST', '/store/coupons', body);

    expect(response.statusCode).toBe(400);
    expect(couponCreate).not.toHaveBeenCalled();
  });

  it('validade no passado: 400', async () => {
    arrangeOwner();

    const response = await call('POST', '/store/coupons', {
      code: 'ABC',
      type: 'fixed',
      value: 5,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('COUPON_EXPIRES_IN_PAST');
  });

  it('liga/desliga o cupom', async () => {
    arrangeOwner();
    couponFindFirst.mockResolvedValue(couponRow());
    couponUpdateMany.mockResolvedValue({ count: 1 });

    const response = await call('PATCH', `/store/coupons/${COUPON_ID}`, { isActive: false });

    expect(response.statusCode).toBe(200);
    expect(couponUpdateMany).toHaveBeenCalledWith({
      where: { id: COUPON_ID, storeId: 'store-1' },
      data: { isActive: false },
    });
  });

  it('PATCH sem nenhum campo: 400; cupom de outra loja: 404', async () => {
    arrangeOwner();
    expect((await call('PATCH', `/store/coupons/${COUPON_ID}`, {})).statusCode).toBe(400);

    couponFindFirst.mockResolvedValue(null);
    expect(
      (await call('PATCH', `/store/coupons/${COUPON_ID}`, { isActive: false })).statusCode,
    ).toBe(404);
    expect(couponUpdateMany).not.toHaveBeenCalled();
  });

  it('não deixa subir o percentual de um cupom % acima de 100', async () => {
    arrangeOwner();
    couponFindFirst.mockResolvedValue(couponRow());

    const response = await call('PATCH', `/store/coupons/${COUPON_ID}`, { value: 150 });

    expect(response.statusCode).toBe(400);
  });

  it('apaga o cupom da loja (204); de outra loja, 404', async () => {
    arrangeOwner();
    couponDeleteMany.mockResolvedValue({ count: 1 });
    expect((await call('DELETE', `/store/coupons/${COUPON_ID}`)).statusCode).toBe(204);
    expect(couponDeleteMany).toHaveBeenCalledWith({ where: { id: COUPON_ID, storeId: 'store-1' } });

    couponDeleteMany.mockResolvedValue({ count: 0 });
    expect((await call('DELETE', `/store/coupons/${COUPON_ID}`)).statusCode).toBe(404);
  });
});

describe('POST /public/stores/:handle/coupons/validate (carrinho da vitrine, sem login)', () => {
  const URL = '/public/stores/lealperfumaria/coupons/validate';
  const body = { code: 'verao10', items: [{ storeProductId: PRODUCT_A, quantity: 2 }] };

  function arrangeCart(price = 55) {
    storeFindUnique.mockResolvedValue(STORE);
    storeProductFindMany.mockResolvedValue([
      { id: PRODUCT_A, price: money(price), promoPrice: null, promoEndsAt: null },
    ]);
  }

  it('calcula o desconto no servidor, com o preço da loja, sem precisar de token', async () => {
    arrangeCart();
    couponFindUnique.mockResolvedValue(couponRow());

    const response = await call('POST', URL, body, null);

    expect(response.statusCode).toBe(200);
    expect(couponFindUnique).toHaveBeenCalledWith({
      where: { storeId_code: { storeId: 'store-1', code: 'VERAO10' } },
    });
    expect(response.json()).toEqual({
      code: 'VERAO10',
      type: 'percent',
      value: 10,
      subtotal: 110,
      discount: 11,
      total: 99,
    });
  });

  it('usa o preço promocional enquanto a promoção vale', async () => {
    storeFindUnique.mockResolvedValue(STORE);
    storeProductFindMany.mockResolvedValue([
      {
        id: PRODUCT_A,
        price: money(55),
        promoPrice: money(40),
        promoEndsAt: new Date(Date.now() + 86_400_000),
      },
    ]);
    couponFindUnique.mockResolvedValue(couponRow());

    const response = await call('POST', URL, body, null);

    expect(response.json()).toMatchObject({ subtotal: 80, discount: 8, total: 72 });
  });

  it('cupom que não existe: 400 com mensagem genérica', async () => {
    arrangeCart();
    couponFindUnique.mockResolvedValue(null);

    const response = await call('POST', URL, body, null);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'COUPON_INVALID',
      message: 'Cupom inválido ou expirado.',
    });
  });

  it('abaixo do pedido mínimo: 400 dizendo o valor', async () => {
    arrangeCart();
    couponFindUnique.mockResolvedValue(couponRow({ minOrder: money(200) }));

    const response = await call('POST', URL, body, null);

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('200,00');
  });

  it('produto fora da vitrine: 404', async () => {
    storeFindUnique.mockResolvedValue(STORE);
    storeProductFindMany.mockResolvedValue([]);
    couponFindUnique.mockResolvedValue(couponRow());

    const response = await call('POST', URL, body, null);

    expect(response.statusCode).toBe(404);
  });

  it('loja inexistente ou desligada: 404', async () => {
    storeFindUnique.mockResolvedValue(null);
    expect((await call('POST', URL, body, null)).statusCode).toBe(404);

    storeFindUnique.mockResolvedValue({ ...STORE, isOnline: false });
    expect((await call('POST', URL, body, null)).statusCode).toBe(404);
  });

  it('não aceita carrinho vazio nem código vazio (400)', async () => {
    expect((await call('POST', URL, { code: 'ABC', items: [] }, null)).statusCode).toBe(400);
    expect((await call('POST', URL, { code: '', items: body.items }, null)).statusCode).toBe(400);
  });
});
