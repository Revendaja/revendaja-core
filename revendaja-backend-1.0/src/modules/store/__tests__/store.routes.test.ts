import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const storeFindUnique = jest.fn();
const storeCreate = jest.fn();
const storeUpdate = jest.fn();
const productFindUnique = jest.fn();
const storeProductFindUnique = jest.fn();
const storeProductFindFirst = jest.fn();
const storeProductFindMany = jest.fn();
const storeProductCount = jest.fn();
const storeProductCreate = jest.fn();
const storeProductUpdate = jest.fn();
const storeProductUpdateMany = jest.fn();
const storeProductDelete = jest.fn();
const storeCategoryFindMany = jest.fn();
const storeCategoryCreate = jest.fn();
const storeCategoryFindFirst = jest.fn();
const storeCategoryDelete = jest.fn();
const queryRaw = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: {
      findUnique: (...args: unknown[]) => sessionFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    store: {
      findUnique: (...args: unknown[]) => storeFindUnique(...args),
      create: (...args: unknown[]) => storeCreate(...args),
      update: (...args: unknown[]) => storeUpdate(...args),
    },
    product: {
      findUnique: (...args: unknown[]) => productFindUnique(...args),
    },
    storeProduct: {
      findUnique: (...args: unknown[]) => storeProductFindUnique(...args),
      findFirst: (...args: unknown[]) => storeProductFindFirst(...args),
      findMany: (...args: unknown[]) => storeProductFindMany(...args),
      count: (...args: unknown[]) => storeProductCount(...args),
      create: (...args: unknown[]) => storeProductCreate(...args),
      update: (...args: unknown[]) => storeProductUpdate(...args),
      updateMany: (...args: unknown[]) => storeProductUpdateMany(...args),
      delete: (...args: unknown[]) => storeProductDelete(...args),
    },
    storeCategory: {
      findMany: (...args: unknown[]) => storeCategoryFindMany(...args),
      create: (...args: unknown[]) => storeCategoryCreate(...args),
      findFirst: (...args: unknown[]) => storeCategoryFindFirst(...args),
      delete: (...args: unknown[]) => storeCategoryDelete(...args),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const STORE_PRODUCT_ID = '5c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOKEN = signTestAccessToken(USER_ID);

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Desodorante Colônia',
    barCode: null,
    brandSku: '123',
    description: null,
    productImage: null,
    productImageSm: null,
    brandId: 1,
    basePrice: { toNumber: () => 99.9 },
    brand: { id: 1, name: 'Natura', logo: null, profitability: 30 },
    ...overrides,
  };
}

function buildStoreProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STORE_PRODUCT_ID,
    storeId: 'store-1',
    productId: 1,
    kind: 'catalog',
    // Só usados quando kind = 'manual' (ver store.repository#toDisplayProduct).
    name: null,
    description: null,
    image: null,
    price: { toNumber: () => 55 },
    costPrice: null,
    promoPrice: null,
    promoEndsAt: null,
    stock: 0,
    minStock: 0,
    isActive: true,
    frozen: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    product: buildProductRow(),
    category: null,
    components: [],
    ...overrides,
  };
}

beforeEach(() => {
  sessionFindUnique.mockReset();
  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  userFindUnique.mockReset();
  storeFindUnique.mockReset();
  storeCreate.mockReset();
  storeUpdate.mockReset();
  productFindUnique.mockReset();
  storeProductFindUnique.mockReset();
  storeProductFindFirst.mockReset();
  storeProductFindMany.mockReset();
  storeProductCount.mockReset();
  storeProductCreate.mockReset();
  storeProductUpdate.mockReset();
  storeProductUpdateMany.mockReset();
  storeProductDelete.mockReset();
  storeCategoryFindMany.mockReset();
  storeCategoryCreate.mockReset();
  storeCategoryFindFirst.mockReset();
  storeCategoryDelete.mockReset();
  queryRaw.mockReset();
});

describe('POST /store', () => {
  it('retorna 403 quando o e-mail ainda não foi verificado', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: null }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { storeName: 'Leal Perfumaria' },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it('cria a loja quando o usuário está verificado', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(null);
    storeCreate.mockImplementation(({ data }) =>
      Promise.resolve({
        id: '11111111-1111-4111-8111-111111111111',
        isOnline: true,
        bio: null,
        defaultMinStock: 0,
        createdAt: new Date(),
        ...data,
      }),
    );

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { storeName: 'Leal Perfumaria' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.handle).toBe('lealperfumaria');
    expect(body.catalogLink).toBe('https://lealperfumaria.revendaja.com');
    // Data em ISO-8601 (antes saía como Date.toString(), dependente de fuso/idioma).
    expect(body.createdAt).toMatch(ISO_DATE);

    await app.close();
  });
});

// Plano Pro por padrão: sem limite de produtos e com tudo liberado, pra não afetar os testes que
// não são sobre limite de plano. Os testes de limite (`describe('limites de plano', ...)`) trocam
// o plano de propósito.
const OWN_STORE = {
  id: 'store-1',
  userId: USER_ID,
  storeName: 'Leal Perfumaria',
  handle: 'lealperfumaria',
  catalogLink: 'https://lealperfumaria.revendaja.com',
  isOnline: true,
  bio: null,
  plan: 'premium',
  defaultMinStock: 0,
  createdAt: new Date(),
};

describe('PATCH /store (liga/desliga a vitrine)', () => {
  async function patchStore(
    payload: Record<string, unknown> | undefined,
    token: string | null = TOKEN,
  ) {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/store',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload,
    });
    await app.close();
    return response;
  }

  // A resposta valida `id` como UUID (no banco o id da loja é sempre um UUID).
  const STORE_ID = '11111111-1111-4111-8111-111111111111';
  const STORE_ROW = { ...OWN_STORE, id: STORE_ID };

  function arrangeVerifiedStore() {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(STORE_ROW);
    storeUpdate.mockImplementation(({ data }: { data: { isOnline: boolean } }) =>
      Promise.resolve({ ...STORE_ROW, ...data }),
    );
  }

  it('retorna 401 sem token', async () => {
    const response = await patchStore({ isOnline: false }, null);

    expect(response.statusCode).toBe(401);
  });

  it('retorna 403 quando o e-mail ainda não foi verificado', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: null }));

    const response = await patchStore({ isOnline: false });

    expect(response.statusCode).toBe(403);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('retorna 404 quando a conta não tem loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(null);

    const response = await patchStore({ isOnline: false });

    expect(response.statusCode).toBe(404);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it.each([[true], [false]])(
    'isOnline = %s: grava na PRÓPRIA loja e devolve a loja atualizada',
    async (isOnline) => {
      arrangeVerifiedStore();
      // Parte do estado OPOSTO: ligar uma loja que já está ligada não grava nada (idempotente).
      storeFindUnique.mockResolvedValue({ ...STORE_ROW, isOnline: !isOnline });

      const response = await patchStore({ isOnline });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        id: STORE_ID,
        storeName: 'Leal Perfumaria',
        handle: 'lealperfumaria',
        catalogLink: 'https://lealperfumaria.revendaja.com',
        isOnline,
      });
      expect(body.createdAt).toMatch(ISO_DATE);
      expect(storeUpdate).toHaveBeenCalledWith({ where: { id: STORE_ID }, data: { isOnline } });
    },
  );

  it('é idempotente: repetir o mesmo valor devolve 200 igual e nem grava de novo', async () => {
    arrangeVerifiedStore();
    storeFindUnique.mockResolvedValue({ ...STORE_ROW, isOnline: false });

    const response = await patchStore({ isOnline: false });

    expect(response.statusCode).toBe(200);
    expect(response.json().isOnline).toBe(false);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('só grava campos da loja: userId, plano e meta enviados são ignorados', async () => {
    arrangeVerifiedStore();
    storeFindUnique.mockResolvedValue({ ...STORE_ROW, isOnline: false });

    const response = await patchStore({
      isOnline: true,
      userId: 'outro-usuario',
      plan: 'premium',
      monthlyGoal: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(storeUpdate.mock.calls[0][0].data).toEqual({ isOnline: true });
  });

  it.each([
    ['ausente', {}],
    ['nulo', { isOnline: null }],
    ['texto', { isOnline: 'true' }],
    ['número', { isOnline: 1 }],
  ])('retorna 400 quando isOnline é %s', async (_label, payload) => {
    const response = await patchStore(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(storeUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH /store (Editar Loja: nome, link e descrição)', () => {
  const STORE_ID = '11111111-1111-4111-8111-111111111111';
  const STORE_ROW = { ...OWN_STORE, id: STORE_ID, bio: 'Descrição antiga' };

  async function patchStore(payload: Record<string, unknown>) {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/store',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload,
    });
    await app.close();
    return response;
  }

  // `stores` é lida por userId (a loja da usuária) e por handle (o link novo já está em uso?).
  function arrange({ handleOwner = null }: { handleOwner?: Record<string, unknown> | null } = {}) {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockImplementation(
      ({ where }: { where: { userId?: string; handle?: string } }) =>
        Promise.resolve(where.userId ? STORE_ROW : handleOwner),
    );
    storeUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...STORE_ROW, ...data }),
    );
  }

  it('troca o nome: grava só o nome e devolve a loja atualizada (com a descrição)', async () => {
    arrange();

    const response = await patchStore({ storeName: '  Nova Perfumaria  ' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: STORE_ID,
      storeName: 'Nova Perfumaria',
      handle: 'lealperfumaria',
      bio: 'Descrição antiga',
    });
    expect(storeUpdate).toHaveBeenCalledWith({
      where: { id: STORE_ID },
      data: { storeName: 'Nova Perfumaria' },
    });
  });

  it('escreve e troca a descrição (sem os espaços das pontas)', async () => {
    arrange();

    const response = await patchStore({ bio: '  Cosméticos com entrega rápida.  ' });

    expect(response.json().bio).toBe('Cosméticos com entrega rápida.');
    expect(storeUpdate.mock.calls[0][0].data).toEqual({ bio: 'Cosméticos com entrega rápida.' });
  });

  it.each([[''], ['   '], [null]])('bio %j LIMPA a descrição (vira null)', async (bio) => {
    arrange();

    const response = await patchStore({ bio });

    expect(response.statusCode).toBe(200);
    expect(response.json().bio).toBeNull();
    expect(storeUpdate.mock.calls[0][0].data).toEqual({ bio: null });
  });

  it('troca o link: grava o handle E o catalogLink juntos (em minúsculas)', async () => {
    arrange();

    const response = await patchStore({ handle: 'NovaLoja' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      handle: 'novaloja',
      catalogLink: 'https://novaloja.revendaja.com',
    });
    expect(storeUpdate.mock.calls[0][0].data).toEqual({
      handle: 'novaloja',
      catalogLink: 'https://novaloja.revendaja.com',
    });
  });

  it('aceita hífen no meio do link', async () => {
    arrange();

    const response = await patchStore({ handle: 'leal-perfumaria-2' });

    expect(response.statusCode).toBe(200);
    expect(response.json().handle).toBe('leal-perfumaria-2');
  });

  it('troca o estoque mínimo padrão: grava defaultMinStock, devolve a loja atualizada e aplica o valor novo em quem ainda estava no padrão antigo', async () => {
    arrange();
    storeProductUpdateMany.mockResolvedValue({ count: 3 });

    const response = await patchStore({ defaultMinStock: 2 });

    expect(response.statusCode).toBe(200);
    expect(response.json().defaultMinStock).toBe(2);
    expect(storeUpdate.mock.calls[0][0].data).toEqual({ defaultMinStock: 2 });
    // STORE_ROW.defaultMinStock (o padrão ANTIGO) é 0: só produto ainda em minStock 0 é atualizado.
    expect(storeProductUpdateMany).toHaveBeenCalledWith({
      where: { storeId: STORE_ID, minStock: 0 },
      data: { minStock: 2 },
    });
  });

  it('defaultMinStock igual ao já gravado: nada é atualizado (nem a loja, nem os produtos)', async () => {
    arrange();

    const response = await patchStore({ defaultMinStock: STORE_ROW.defaultMinStock });

    expect(response.statusCode).toBe(200);
    expect(storeUpdate).not.toHaveBeenCalled();
    expect(storeProductUpdateMany).not.toHaveBeenCalled();
  });

  it('link que já é de OUTRA loja: 409 HANDLE_UNAVAILABLE e nada é gravado', async () => {
    arrange({ handleOwner: { ...OWN_STORE, id: 'outra-loja', handle: 'novaloja' } });

    const response = await patchStore({ handle: 'novaloja' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'HANDLE_UNAVAILABLE',
      message: 'Este link não está disponível. Escolha outro.',
    });
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it.each([['www'], ['api'], ['admin'], ['suporte']])(
    'link reservado "%s": 409 HANDLE_UNAVAILABLE',
    async (handle) => {
      arrange();

      const response = await patchStore({ handle });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('HANDLE_UNAVAILABLE');
      expect(storeUpdate).not.toHaveBeenCalled();
    },
  );

  it('corrida: outra loja pegou o link no mesmo instante (índice único): 409, não 500', async () => {
    arrange();
    storeUpdate.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));

    const response = await patchStore({ handle: 'novaloja' });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('HANDLE_UNAVAILABLE');
  });

  it('o link atual da própria loja não é conflito: nada é gravado e a resposta é 200', async () => {
    arrange();

    const response = await patchStore({ handle: 'lealperfumaria' });

    expect(response.statusCode).toBe(200);
    expect(response.json().handle).toBe('lealperfumaria');
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('edita tudo de uma vez', async () => {
    arrange();

    const response = await patchStore({
      storeName: 'Outra Loja',
      handle: 'outraloja',
      bio: 'Texto novo',
      isOnline: false,
    });

    expect(response.statusCode).toBe(200);
    expect(storeUpdate.mock.calls[0][0].data).toEqual({
      storeName: 'Outra Loja',
      handle: 'outraloja',
      catalogLink: 'https://outraloja.revendaja.com',
      bio: 'Texto novo',
      isOnline: false,
    });
  });

  it.each([
    ['nome com 1 caractere', { storeName: 'A' }],
    ['nome só com espaços', { storeName: '   ' }],
    ['nome com mais de 120 caracteres', { storeName: 'a'.repeat(121) }],
    ['nome que não é texto', { storeName: 123 }],
    ['link curto demais (menos de 3)', { handle: 'ab' }],
    ['link com mais de 63 caracteres', { handle: 'a'.repeat(64) }],
    ['link com espaço', { handle: 'minha loja' }],
    ['link com sublinhado', { handle: 'minha_loja' }],
    ['link com acento', { handle: 'lôja' }],
    ['link com ponto (viraria outro subdomínio)', { handle: 'a.b.c' }],
    ['link começando com hífen', { handle: '-loja' }],
    ['link terminando com hífen', { handle: 'loja-' }],
    ['link com hífen duplo', { handle: 'mi--nha' }],
    ['descrição com mais de 280 caracteres', { bio: 'a'.repeat(281) }],
    ['descrição que não é texto', { bio: 5 }],
  ])('retorna 400 para %s', async (_label, payload) => {
    arrange();

    const response = await patchStore(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('aceita a descrição com exatamente 280 caracteres', async () => {
    arrange();

    const response = await patchStore({ bio: 'a'.repeat(280) });

    expect(response.statusCode).toBe(200);
  });
});

describe('PUT /store/goal', () => {
  async function putGoal(
    payload: Record<string, unknown> | undefined,
    token: string | null = TOKEN,
  ) {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/store/goal',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload,
    });
    await app.close();
    return response;
  }

  function arrangeVerifiedStore() {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
  }

  it('retorna 401 sem token', async () => {
    const response = await putGoal({ monthlyGoal: 5000 }, null);

    expect(response.statusCode).toBe(401);
  });

  it('retorna 403 quando o e-mail ainda não foi verificado', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: null }));

    const response = await putGoal({ monthlyGoal: 5000 });

    expect(response.statusCode).toBe(403);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('retorna 404 quando a conta não tem loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(null);

    const response = await putGoal({ monthlyGoal: 5000 });

    expect(response.statusCode).toBe(404);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('define a meta da PRÓPRIA loja e devolve o valor gravado', async () => {
    arrangeVerifiedStore();
    storeUpdate.mockResolvedValue({ monthlyGoal: { toNumber: () => 5000 } });

    const response = await putGoal({ monthlyGoal: 5000 });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ monthlyGoal: 5000 });
    expect(storeUpdate).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { monthlyGoal: 5000 },
      select: { monthlyGoal: true },
    });
  });

  it('aceita centavos', async () => {
    arrangeVerifiedStore();
    storeUpdate.mockResolvedValue({ monthlyGoal: { toNumber: () => 1234.56 } });

    const response = await putGoal({ monthlyGoal: 1234.56 });

    expect(response.statusCode).toBe(200);
    expect(response.json().monthlyGoal).toBe(1234.56);
  });

  it.each([
    ['zero', { monthlyGoal: 0 }],
    ['negativa', { monthlyGoal: -100 }],
    ['abaixo de 1 centavo', { monthlyGoal: 0.001 }],
    ['texto', { monthlyGoal: '5000' }],
    ['acima do teto', { monthlyGoal: 10_000_000_000 }],
    ['ausente', {}],
    ['null (a meta não pode ser removida, só trocada)', { monthlyGoal: null }],
  ])('retorna 400 quando a meta é %s', async (_label, payload) => {
    const response = await putGoal(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('aceita exatamente o teto (9999999999.99)', async () => {
    arrangeVerifiedStore();
    storeUpdate.mockResolvedValue({ monthlyGoal: { toNumber: () => 9_999_999_999.99 } });

    const response = await putGoal({ monthlyGoal: 9_999_999_999.99 });

    expect(response.statusCode).toBe(200);
  });
});

describe('GET/PATCH /store/settings (tela Mais)', () => {
  const ROW = {
    plan: 'free',
    monthlyGoal: null,
    acceptedPaymentMethods: ['pix', 'card', 'cash'],
    hideOutOfStock: true,
  };

  // A mesma tabela `stores` é lida de dois jeitos: a loja da usuária (where.userId) e as configurações (where.id).
  function arrangeStoreWithSettings(row: Record<string, unknown> = ROW) {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockImplementation(({ where }: { where: { userId?: string } }) =>
      Promise.resolve(where.userId ? OWN_STORE : row),
    );
  }

  async function call(
    method: 'GET' | 'PATCH',
    payload?: Record<string, unknown>,
    token: string | null = TOKEN,
  ) {
    const app = await buildApp();
    const response = await app.inject({
      method,
      url: '/store/settings',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload,
    });
    await app.close();
    return response;
  }

  it.each([['GET'], ['PATCH']] as const)('%s retorna 401 sem token', async (method) => {
    const response = await call(
      method,
      method === 'PATCH' ? { hideOutOfStock: true } : undefined,
      null,
    );

    expect(response.statusCode).toBe(401);
  });

  it.each([['GET'], ['PATCH']] as const)('%s retorna 403 sem e-mail verificado', async (method) => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: null }));

    const response = await call(method, method === 'PATCH' ? { hideOutOfStock: true } : undefined);

    expect(response.statusCode).toBe(403);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it.each([['GET'], ['PATCH']] as const)(
    '%s retorna 404 quando a conta não tem loja',
    async (method) => {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(null);

      const response = await call(
        method,
        method === 'PATCH' ? { hideOutOfStock: true } : undefined,
      );

      expect(response.statusCode).toBe(404);
      expect(storeUpdate).not.toHaveBeenCalled();
    },
  );

  describe('GET', () => {
    it('loja nova: plano Gratuito, aceita Pix, Cartão e Dinheiro e oculta produtos sem estoque', async () => {
      arrangeStoreWithSettings();

      const response = await call('GET');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        plan: { id: 'free', name: 'Gratuito' },
        acceptedPaymentMethods: ['pix', 'card', 'cash'],
        hideOutOfStock: true,
      });
    });

    it('lê as configurações da PRÓPRIA loja, pelo id', async () => {
      arrangeStoreWithSettings();

      await call('GET');

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

    it('não devolve fiado, mesmo que o banco tenha on_account no array', async () => {
      arrangeStoreWithSettings({ ...ROW, acceptedPaymentMethods: ['on_account', 'pix'] });

      const response = await call('GET');

      expect(response.json().acceptedPaymentMethods).toEqual(['pix']);
    });

    it('não vaza a meta de vendas nem dados internos da loja', async () => {
      arrangeStoreWithSettings({ ...ROW, monthlyGoal: { toNumber: () => 5000 } });

      const response = await call('GET');

      expect(Object.keys(response.json()).sort()).toEqual([
        'acceptedPaymentMethods',
        'hideOutOfStock',
        'plan',
      ]);
    });
  });

  describe('PATCH', () => {
    function arrangeUpdate() {
      arrangeStoreWithSettings();
      storeUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...ROW,
          ...(data.acceptedPaymentMethods
            ? { acceptedPaymentMethods: (data.acceptedPaymentMethods as { set: string[] }).set }
            : {}),
          ...(data.hideOutOfStock !== undefined ? { hideOutOfStock: data.hideOutOfStock } : {}),
        }),
      );
    }

    it('desliga "ocultar produtos sem estoque": grava false (não é campo ausente)', async () => {
      arrangeUpdate();

      const response = await call('PATCH', { hideOutOfStock: false });

      expect(response.statusCode).toBe(200);
      expect(response.json().hideOutOfStock).toBe(false);
      expect(storeUpdate).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: { hideOutOfStock: false },
        select: expect.any(Object),
      });
    });

    it('troca as formas de pagamento aceitas e grava sempre em Pix, Cartão, Dinheiro', async () => {
      arrangeUpdate();

      const response = await call('PATCH', { acceptedPaymentMethods: ['cash', 'pix'] });

      expect(response.statusCode).toBe(200);
      expect(response.json().acceptedPaymentMethods).toEqual(['pix', 'cash']);
      expect(storeUpdate.mock.calls[0][0].data).toEqual({
        acceptedPaymentMethods: { set: ['pix', 'cash'] },
      });
    });

    it('aceita os dois campos juntos', async () => {
      arrangeUpdate();

      const response = await call('PATCH', {
        acceptedPaymentMethods: ['card'],
        hideOutOfStock: false,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        acceptedPaymentMethods: ['card'],
        hideOutOfStock: false,
      });
    });

    it('não permite mexer no plano nem na meta por aqui (campos desconhecidos são ignorados)', async () => {
      arrangeUpdate();

      const response = await call('PATCH', {
        hideOutOfStock: true,
        plan: 'premium',
        monthlyGoal: 1,
      });

      expect(response.statusCode).toBe(200);
      expect(storeUpdate.mock.calls[0][0].data).toEqual({ hideOutOfStock: true });
      expect(response.json().plan).toEqual({ id: 'free', name: 'Gratuito' });
    });

    it.each([
      ['nenhum campo', {}],
      [
        'nenhuma forma de pagamento (a vitrine precisa aceitar ao menos uma)',
        { acceptedPaymentMethods: [] },
      ],
      ['forma de pagamento repetida', { acceptedPaymentMethods: ['pix', 'pix'] }],
      ['fiado (on_account não existe mais)', { acceptedPaymentMethods: ['pix', 'on_account'] }],
      ['forma de pagamento desconhecida', { acceptedPaymentMethods: ['boleto'] }],
      ['acceptedPaymentMethods que não é lista', { acceptedPaymentMethods: 'pix' }],
      ['hideOutOfStock que não é booleano', { hideOutOfStock: 'sim' }],
      ['hideOutOfStock nulo', { hideOutOfStock: null }],
    ])('retorna 400 para %s', async (_label, payload) => {
      const response = await call('PATCH', payload);

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
      expect(storeUpdate).not.toHaveBeenCalled();
    });
  });
});

describe('POST /store/products', () => {
  it('retorna 404 quando o produto não existe no catálogo', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    productFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { productId: 1, price: 55 },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('retorna 409 quando o produto já está na loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    productFindUnique.mockResolvedValue(buildProductRow());
    storeProductFindUnique.mockResolvedValue(buildStoreProductRow());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { productId: 1, price: 55 },
    });

    expect(response.statusCode).toBe(409);

    await app.close();
  });

  it('importa o produto do catálogo com o preço da loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    productFindUnique.mockResolvedValue(buildProductRow());
    storeProductFindUnique.mockResolvedValue(null);
    storeProductCreate.mockResolvedValue(buildStoreProductRow({ price: { toNumber: () => 55 } }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { productId: 1, price: 55 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.price).toBe(55);
    expect(body.product.brand.name).toBe('Natura');
    expect(body.createdAt).toMatch(ISO_DATE);
    expect(body.updatedAt).toMatch(ISO_DATE);

    await app.close();
  });

  describe('preço de custo e teto de preço', () => {
    function arrange() {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      productFindUnique.mockResolvedValue(buildProductRow());
      storeProductFindUnique.mockResolvedValue(null);
    }

    async function post(payload: Record<string, unknown>) {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/store/products',
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });
      await app.close();
      return response;
    }

    it('grava o costPrice e devolve na resposta', async () => {
      arrange();
      storeProductCreate.mockResolvedValue(
        buildStoreProductRow({ costPrice: { toNumber: () => 30.5 } }),
      );

      const response = await post({ productId: 1, price: 55, costPrice: 30.5 });

      expect(response.statusCode).toBe(201);
      expect(response.json().costPrice).toBe(30.5);
      expect(storeProductCreate.mock.calls[0][0].data.costPrice).toBe(30.5);
    });

    it.each([
      ['ausente', undefined],
      ['null', null],
    ])('costPrice %s = "não informado": grava null e devolve null', async (_label, costPrice) => {
      arrange();
      storeProductCreate.mockResolvedValue(buildStoreProductRow({ costPrice: null }));

      const response = await post({ productId: 1, price: 55, costPrice });

      expect(response.statusCode).toBe(201);
      expect(response.json().costPrice).toBeNull();
      expect(storeProductCreate.mock.calls[0][0].data.costPrice).toBeNull();
    });

    it('aceita costPrice 0 (custo zero é diferente de "não informado")', async () => {
      arrange();
      storeProductCreate.mockResolvedValue(
        buildStoreProductRow({ costPrice: { toNumber: () => 0 } }),
      );

      const response = await post({ productId: 1, price: 55, costPrice: 0 });

      expect(response.statusCode).toBe(201);
      expect(response.json().costPrice).toBe(0);
      expect(storeProductCreate.mock.calls[0][0].data.costPrice).toBe(0);
    });

    it.each([
      ['costPrice negativo', { costPrice: -1 }],
      ['costPrice texto', { costPrice: '10' }],
      ['costPrice acima de 99999999.99', { costPrice: 100_000_000 }],
      ['price acima de 99999999.99', { price: 100_000_000 }],
    ])('retorna 400 para %s', async (_label, override) => {
      const response = await post({ productId: 1, price: 55, ...override });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
      expect(storeProductCreate).not.toHaveBeenCalled();
    });

    it('aceita exatamente 99999999.99 (limite)', async () => {
      arrange();
      storeProductCreate.mockResolvedValue(buildStoreProductRow());

      const response = await post({ productId: 1, price: 99_999_999.99, costPrice: 99_999_999.99 });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('estoque', () => {
    function arrangeVerifiedStore() {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      productFindUnique.mockResolvedValue(buildProductRow());
      storeProductFindUnique.mockResolvedValue(null);
    }

    async function postProduct(payload: Record<string, unknown>) {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/store/products',
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });
      await app.close();
      return response;
    }

    it('grava a quantidade informada e devolve stock na resposta', async () => {
      arrangeVerifiedStore();
      storeProductCreate.mockResolvedValue(buildStoreProductRow({ stock: 12 }));

      const response = await postProduct({ productId: 1, price: 55, stock: 12 });

      expect(response.statusCode).toBe(201);
      expect(response.json().stock).toBe(12);
      expect(storeProductCreate.mock.calls[0][0].data).toMatchObject({ productId: 1, stock: 12 });
    });

    it('sem stock no body, o produto entra com estoque 0', async () => {
      arrangeVerifiedStore();
      storeProductCreate.mockResolvedValue(buildStoreProductRow({ stock: 0 }));

      const response = await postProduct({ productId: 1, price: 55 });

      expect(response.statusCode).toBe(201);
      expect(response.json().stock).toBe(0);
      expect(storeProductCreate.mock.calls[0][0].data.stock).toBe(0);
    });

    it.each([
      ['negativo', -1],
      ['decimal', 1.5],
      ['texto', '10'],
      ['nulo', null],
      ['acima do teto', 1_000_001],
    ])('retorna 400 quando stock é %s', async (_label, stock) => {
      const response = await postProduct({ productId: 1, price: 55, stock });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
      expect(storeProductCreate).not.toHaveBeenCalled();
    });
  });
});

describe('GET /store/products', () => {
  it('lista os produtos da loja autenticada', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindMany.mockResolvedValue([buildStoreProductRow()]);
    storeProductCount.mockResolvedValue(1);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/store/products',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(1);

    await app.close();
  });

  describe('busca (search)', () => {
    async function list(query: string) {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      storeProductFindMany.mockResolvedValue([buildStoreProductRow()]);
      storeProductCount.mockResolvedValue(1);
      // Busca por nome vira "quais ids combinam por similaridade" (ver catalog.search.ts) — o mesmo
      // mock serve pro catálogo (id numérico) e pro nome do produto manual (id do StoreProduct).
      queryRaw.mockResolvedValue([{ id: 1 }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: `/store/products${query}`,
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      await app.close();
      return response;
    }

    it('sem search: só filtra pela loja', async () => {
      const response = await list('');

      expect(response.statusCode).toBe(200);
      expect(storeProductFindMany.mock.calls[0][0].where).toEqual({ storeId: 'store-1' });
    });

    it('por nome: filtra pelo produto do catálogo OU pelo nome do produto manual (similaridade)', async () => {
      await list('?search=kaiak');

      expect(storeProductFindMany.mock.calls[0][0].where).toEqual({
        storeId: 'store-1',
        OR: [{ product: { id: { in: [1] } } }, { id: { in: [1] } }],
      });
    });

    it('por código de barras (8 a 14 dígitos): nome (similaridade) OU código exato, sempre dentro da loja', async () => {
      await list('?search=7899952323991');

      const where = storeProductFindMany.mock.calls[0][0].where;
      expect(where.storeId).toBe('store-1');
      expect(where.OR[0].product.OR).toEqual([
        { id: { in: [1] } },
        { barCode: { in: expect.arrayContaining(['7899952323991', '07899952323991']) } },
      ]);
      expect(where.OR[1]).toEqual({ id: { in: [1] } });
    });

    it('o total usa o mesmo filtro da listagem', async () => {
      await list('?search=7899952323991');

      expect(storeProductCount.mock.calls[0][0].where).toEqual(
        storeProductFindMany.mock.calls[0][0].where,
      );
    });

    it('search vazio dá 400 (o app deve omitir o parâmetro)', async () => {
      const response = await list('?search=');

      expect(response.statusCode).toBe(400);
    });
  });

  it('inclui o estoque de cada produto', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindMany.mockResolvedValue([buildStoreProductRow({ stock: 8 })]);
    storeProductCount.mockResolvedValue(1);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/store/products',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    await app.close();

    expect(response.json().items[0].stock).toBe(8);
  });

  describe('ordenação (sort)', () => {
    async function listSorted(sort?: string) {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      storeProductFindMany.mockResolvedValue([]);
      storeProductCount.mockResolvedValue(0);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: `/store/products${sort ? `?sort=${sort}` : ''}`,
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      await app.close();
      return response;
    }

    it('sem sort: mais recente primeiro (comportamento padrão)', async () => {
      const response = await listSorted();

      expect(response.statusCode).toBe(200);
      expect(storeProductFindMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }]);
    });

    it.each([
      ['name_asc', [{ product: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }]],
      ['name_desc', [{ product: { name: 'desc' } }, { name: 'desc' }, { id: 'asc' }]],
      ['price_asc', [{ price: 'asc' }, { id: 'asc' }]],
      ['price_desc', [{ price: 'desc' }, { id: 'asc' }]],
      ['stock_asc', [{ stock: 'asc' }, { id: 'asc' }]],
    ] as const)('sort=%s usa o orderBy correspondente', async (sort, expectedOrderBy) => {
      await listSorted(sort);

      expect(storeProductFindMany.mock.calls[0][0].orderBy).toEqual(expectedOrderBy);
    });

    it('sort inválido: 400', async () => {
      const response = await listSorted('invalido');

      expect(response.statusCode).toBe(400);
    });
  });

  describe('filtro por categoria', () => {
    it('categoryId filtra a listagem', async () => {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      storeProductFindMany.mockResolvedValue([]);
      storeProductCount.mockResolvedValue(0);
      const categoryId = '77777777-7777-4777-8777-777777777777';

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: `/store/products?categoryId=${categoryId}`,
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      await app.close();

      expect(response.statusCode).toBe(200);
      expect(storeProductFindMany.mock.calls[0][0].where).toEqual({
        storeId: 'store-1',
        categoryId,
      });
    });
  });
});

describe('GET/POST/DELETE /store/products/categories', () => {
  function arrange() {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
  }

  const CATEGORY_A = '66666666-6666-4666-8666-666666666666';
  const CATEGORY_B = '77777777-7777-4777-8777-777777777777';

  it('GET lista as categorias da loja, com quantos produtos cada uma tem', async () => {
    arrange();
    storeCategoryFindMany.mockResolvedValue([
      { id: CATEGORY_A, name: 'Perfumaria', _count: { products: 3 } },
      { id: CATEGORY_B, name: 'Cestas', _count: { products: 0 } },
    ]);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/store/products/categories',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        { id: CATEGORY_A, name: 'Perfumaria', productCount: 3 },
        { id: CATEGORY_B, name: 'Cestas', productCount: 0 },
      ],
    });
    expect(storeCategoryFindMany.mock.calls[0][0].where).toEqual({ storeId: 'store-1' });
  });

  it('POST cria uma categoria e devolve 201', async () => {
    arrange();
    storeCategoryCreate.mockResolvedValue({ id: CATEGORY_A, name: 'Perfumaria' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products/categories',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: 'Perfumaria' },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: CATEGORY_A, name: 'Perfumaria', productCount: 0 });
    expect(storeCategoryCreate.mock.calls[0][0].data).toEqual({ storeId: 'store-1', name: 'Perfumaria' });
  });

  it('POST com nome repetido: 409 (índice único storeId+name)', async () => {
    arrange();
    storeCategoryCreate.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products/categories',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: 'Perfumaria' },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
  });

  it('POST com nome vazio: 400', async () => {
    arrange();

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products/categories',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: '' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  const CATEGORY_ID = '66666666-6666-4666-8666-666666666666';

  it('DELETE apaga a categoria e devolve 204', async () => {
    arrange();
    storeCategoryFindFirst.mockResolvedValue({ id: CATEGORY_ID });
    storeCategoryDelete.mockResolvedValue({ id: CATEGORY_ID });

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/store/products/categories/${CATEGORY_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(storeCategoryFindFirst.mock.calls[0][0].where).toEqual({ id: CATEGORY_ID, storeId: 'store-1' });
  });

  it('DELETE de categoria de outra loja (ou inexistente): 404', async () => {
    arrange();
    storeCategoryFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/store/products/categories/${CATEGORY_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(storeCategoryDelete).not.toHaveBeenCalled();
  });
});

describe('limites de plano', () => {
  const FREE_STORE = { ...OWN_STORE, plan: 'free' };

  function arrange(store: typeof OWN_STORE = FREE_STORE) {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(store);
  }

  it('POST /store/products: 403 quando a loja Gratuita já está nos 30 produtos', async () => {
    arrange();
    productFindUnique.mockResolvedValue(buildProductRow());
    storeProductFindUnique.mockResolvedValue(null);
    storeProductCount.mockResolvedValue(30);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { productId: 1, price: 55 },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('PLAN_LIMIT_REACHED');
    expect(storeProductCreate).not.toHaveBeenCalled();
  });

  it('POST /store/products/manual: 403 no plano Gratuito (cadastro manual não liberado)', async () => {
    arrange();

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products/manual',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: 'Ursinho de pelúcia', price: 20, stock: 1 },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('PLAN_LIMIT_REACHED');
    expect(storeProductCreate).not.toHaveBeenCalled();
  });

  it('POST /store/products/categories: 403 no plano Gratuito (categorias não liberadas)', async () => {
    arrange();

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products/categories',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { name: 'Perfumaria' },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('PLAN_LIMIT_REACHED');
    expect(storeCategoryCreate).not.toHaveBeenCalled();
  });

  it('plano Inicial: sem os bloqueios do Gratuito, mas ainda vale o teto de 200 produtos', async () => {
    arrange({ ...OWN_STORE, plan: 'starter' });
    productFindUnique.mockResolvedValue(buildProductRow());
    storeProductFindUnique.mockResolvedValue(null);
    storeProductCount.mockResolvedValue(200);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/store/products',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { productId: 1, price: 55 },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('PLAN_LIMIT_REACHED');
  });
});

describe('GET /store/products/:id', () => {
  it('retorna 404 quando o produto não pertence à loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/store/products/${STORE_PRODUCT_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('retorna o produto da própria loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindFirst.mockResolvedValue(buildStoreProductRow());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/store/products/${STORE_PRODUCT_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(STORE_PRODUCT_ID);

    await app.close();
  });
});

describe('PATCH /store/products/:id', () => {
  it('retorna 404 quando o produto não pertence à loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/store/products/${STORE_PRODUCT_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { price: 70 },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('edita o preço de um produto da própria loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindFirst.mockResolvedValue(buildStoreProductRow());
    storeProductUpdate.mockResolvedValue(buildStoreProductRow({ price: { toNumber: () => 70 } }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/store/products/${STORE_PRODUCT_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { price: 70 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().price).toBe(70);

    await app.close();
  });

  describe('preço de custo', () => {
    async function patchCost(payload: Record<string, unknown>) {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      storeProductFindFirst.mockResolvedValue(buildStoreProductRow());
      storeProductUpdate.mockImplementation(({ data }) =>
        Promise.resolve(
          buildStoreProductRow({
            costPrice: data.costPrice == null ? null : { toNumber: () => data.costPrice },
          }),
        ),
      );

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: `/store/products/${STORE_PRODUCT_ID}`,
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });
      await app.close();
      return response;
    }

    it('atualiza só o costPrice e devolve o item', async () => {
      const response = await patchCost({ costPrice: 32.9 });

      expect(response.statusCode).toBe(200);
      expect(response.json().costPrice).toBe(32.9);
      expect(storeProductUpdate.mock.calls[0][0].data).toEqual({ costPrice: 32.9 });
    });

    it('costPrice null LIMPA o custo (é um campo enviado, não "ausente")', async () => {
      const response = await patchCost({ costPrice: null });

      expect(response.statusCode).toBe(200);
      expect(response.json().costPrice).toBeNull();
      expect(storeProductUpdate.mock.calls[0][0].data).toEqual({ costPrice: null });
    });

    it('costPrice 0 é válido', async () => {
      const response = await patchCost({ costPrice: 0 });

      expect(response.statusCode).toBe(200);
      expect(storeProductUpdate.mock.calls[0][0].data).toEqual({ costPrice: 0 });
    });

    it.each([
      ['negativo', -5],
      ['texto', '5'],
      ['acima do teto', 100_000_000],
    ])('retorna 400 quando costPrice é %s', async (_label, costPrice) => {
      const response = await patchCost({ costPrice });

      expect(response.statusCode).toBe(400);
      expect(storeProductUpdate).not.toHaveBeenCalled();
    });
  });

  describe('estoque', () => {
    async function patchProduct(payload: Record<string, unknown>) {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      storeProductFindFirst.mockResolvedValue(buildStoreProductRow());
      storeProductUpdate.mockImplementation(({ data }) =>
        Promise.resolve(buildStoreProductRow({ stock: data.stock ?? 0 })),
      );

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: `/store/products/${STORE_PRODUCT_ID}`,
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });
      await app.close();
      return response;
    }

    it('atualiza só o estoque (valor absoluto) e devolve o item atualizado', async () => {
      const response = await patchProduct({ stock: 5 });

      expect(response.statusCode).toBe(200);
      expect(response.json().stock).toBe(5);
      expect(storeProductUpdate.mock.calls[0][0].data).toEqual({ stock: 5 });
    });

    it('aceita stock 0 (esgotado): zero não é tratado como "campo ausente"', async () => {
      const response = await patchProduct({ stock: 0 });

      expect(response.statusCode).toBe(200);
      expect(storeProductUpdate.mock.calls[0][0].data).toEqual({ stock: 0 });
    });

    it('aceita preço, estoque e visibilidade juntos', async () => {
      const response = await patchProduct({ price: 70, stock: 3, isActive: false });

      expect(response.statusCode).toBe(200);
      expect(storeProductUpdate.mock.calls[0][0].data).toEqual({
        price: 70,
        stock: 3,
        isActive: false,
      });
    });

    it.each([
      ['negativo', -1],
      ['decimal', 2.5],
      ['texto', '5'],
      ['acima do teto', 1_000_001],
    ])('retorna 400 quando stock é %s', async (_label, stock) => {
      const response = await patchProduct({ stock });

      expect(response.statusCode).toBe(400);
      expect(storeProductUpdate).not.toHaveBeenCalled();
    });

    it('retorna 400 com mensagem clara quando o body não tem nenhum campo', async () => {
      const response = await patchProduct({});

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('Informe ao menos um campo para atualizar.');
      expect(storeProductUpdate).not.toHaveBeenCalled();
    });
  });

  describe('promoção (preço promocional temporário)', () => {
    const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const PAST = new Date(Date.now() - 60_000).toISOString();

    async function patchPromo(payload: Record<string, unknown>) {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      // price 55 (default de buildStoreProductRow): usado como referência pra validar promoPrice.
      storeProductFindFirst.mockResolvedValue(buildStoreProductRow());
      storeProductUpdate.mockImplementation(({ data }) =>
        Promise.resolve(
          buildStoreProductRow({
            promoPrice: data.promoPrice == null ? null : { toNumber: () => data.promoPrice },
            promoEndsAt: data.promoEndsAt ?? null,
          }),
        ),
      );

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: `/store/products/${STORE_PRODUCT_ID}`,
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });
      await app.close();
      return response;
    }

    it('define uma promoção válida (preço menor, validade no futuro)', async () => {
      const response = await patchPromo({ promoPrice: 39.9, promoEndsAt: FUTURE });

      expect(response.statusCode).toBe(200);
      expect(response.json().promoPrice).toBe(39.9);
      expect(response.json().isPromoActive).toBe(true);
      expect(storeProductUpdate.mock.calls[0][0].data.promoPrice).toBe(39.9);
    });

    it('remove a promoção enviando os dois campos como null', async () => {
      const response = await patchPromo({ promoPrice: null, promoEndsAt: null });

      expect(response.statusCode).toBe(200);
      expect(storeProductUpdate.mock.calls[0][0].data).toEqual({ promoPrice: null, promoEndsAt: null });
    });

    it('400 quando promoPrice não é menor que o preço normal', async () => {
      const response = await patchPromo({ promoPrice: 55, promoEndsAt: FUTURE });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('INVALID_PROMO_PRICE');
      expect(storeProductUpdate).not.toHaveBeenCalled();
    });

    it('400 quando promoEndsAt já passou', async () => {
      const response = await patchPromo({ promoPrice: 39.9, promoEndsAt: PAST });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('INVALID_PROMO_END_DATE');
      expect(storeProductUpdate).not.toHaveBeenCalled();
    });

    it('400 quando só um dos dois campos é enviado', async () => {
      const response = await patchPromo({ promoPrice: 39.9 });

      expect(response.statusCode).toBe(400);
      expect(storeProductUpdate).not.toHaveBeenCalled();
    });

    it('compara com o preço NOVO quando price também vem na mesma chamada', async () => {
      // price novo = 30: promoPrice 35 seria inválido pro preço antigo (55) mas também é
      // inválido pro preço novo (30), já que 35 não é menor que 30.
      const response = await patchPromo({ price: 30, promoPrice: 35, promoEndsAt: FUTURE });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('INVALID_PROMO_PRICE');
    });
  });

  describe('categoria', () => {
    async function patchCategory(payload: Record<string, unknown>) {
      userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
      storeFindUnique.mockResolvedValue(OWN_STORE);
      storeProductFindFirst.mockResolvedValue(buildStoreProductRow());
      storeProductUpdate.mockResolvedValue(
        buildStoreProductRow({
          category: payload.categoryId ? { id: payload.categoryId, name: 'Perfumaria' } : null,
        }),
      );

      const app = await buildApp();
      const response = await app.inject({
        method: 'PATCH',
        url: `/store/products/${STORE_PRODUCT_ID}`,
        headers: { authorization: `Bearer ${TOKEN}` },
        payload,
      });
      await app.close();
      return response;
    }

    const CATEGORY_ID = '66666666-6666-4666-8666-666666666666';

    it('atribui uma categoria existente da loja', async () => {
      storeCategoryFindFirst.mockResolvedValue({ id: CATEGORY_ID });

      const response = await patchCategory({ categoryId: CATEGORY_ID });

      expect(response.statusCode).toBe(200);
      expect(storeCategoryFindFirst.mock.calls[0][0].where).toEqual({ id: CATEGORY_ID, storeId: 'store-1' });
      expect(storeProductUpdate.mock.calls[0][0].data.categoryId).toBe(CATEGORY_ID);
    });

    it('404 quando a categoria não é da própria loja', async () => {
      storeCategoryFindFirst.mockResolvedValue(null);

      const response = await patchCategory({ categoryId: CATEGORY_ID });

      expect(response.statusCode).toBe(404);
      expect(storeProductUpdate).not.toHaveBeenCalled();
    });

    it('categoryId null tira o produto da categoria (sem validar existência)', async () => {
      const response = await patchCategory({ categoryId: null });

      expect(response.statusCode).toBe(200);
      expect(storeCategoryFindFirst).not.toHaveBeenCalled();
      expect(storeProductUpdate.mock.calls[0][0].data.categoryId).toBeNull();
    });
  });
});

describe('DELETE /store/products/:id', () => {
  it('retorna 404 quando o produto não pertence à loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/store/products/${STORE_PRODUCT_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('remove um produto da própria loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(OWN_STORE);
    storeProductFindFirst.mockResolvedValue(buildStoreProductRow());
    storeProductDelete.mockResolvedValue(buildStoreProductRow());

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/store/products/${STORE_PRODUCT_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(204);

    await app.close();
  });
});

describe('GET /store/plan (limite do plano)', () => {
  async function call(token: string | null = TOKEN) {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/store/plan',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    await app.close();
    return response;
  }

  it('retorna 401 sem token', async () => {
    const response = await call(null);

    expect(response.statusCode).toBe(401);
  });

  it('retorna 403 sem e-mail verificado', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: null }));

    const response = await call();

    expect(response.statusCode).toBe(403);
  });

  it('retorna 404 quando a conta não tem loja', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue(null);

    const response = await call();

    expect(response.statusCode).toBe(404);
  });

  it('plano Gratuito: limite de 30 produtos, recursos bloqueados e uso atual', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue({ ...OWN_STORE, plan: 'free' });
    storeProductCount.mockResolvedValueOnce(12).mockResolvedValueOnce(0);

    const response = await call();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      plan: { id: 'free', name: 'Gratuito' },
      limits: {
        maxProducts: 30,
        manualProductsEnabled: false,
        categoriesEnabled: false,
        promotionsEnabled: false,
      },
      usage: { products: 12, frozen: 0 },
    });
    expect(storeProductCount.mock.calls[0][0].where).toEqual({ storeId: OWN_STORE.id });
  });

  it('plano Pro: sem limite de produtos (maxProducts null)', async () => {
    userFindUnique.mockResolvedValue(buildUser({ phoneVerifiedAt: new Date() }));
    storeFindUnique.mockResolvedValue({ ...OWN_STORE, plan: 'premium' });
    storeProductCount.mockResolvedValueOnce(250).mockResolvedValueOnce(0);

    const response = await call();

    expect(response.json().limits.maxProducts).toBeNull();
    expect(response.json().usage).toEqual({ products: 250, frozen: 0 });
  });
});
