import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const storeFindUnique = jest.fn();
const storeUpdate = jest.fn();
const storeProductFindMany = jest.fn();
const storeProductCount = jest.fn();
const saleItemGroupBy = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: { findUnique: (...args: unknown[]) => sessionFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    store: {
      findUnique: (...args: unknown[]) => storeFindUnique(...args),
      update: (...args: unknown[]) => storeUpdate(...args),
    },
    storeProduct: {
      findMany: (...args: unknown[]) => storeProductFindMany(...args),
      count: (...args: unknown[]) => storeProductCount(...args),
    },
    saleItem: { groupBy: (...args: unknown[]) => saleItemGroupBy(...args) },
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const TOKEN = signTestAccessToken(USER_ID);
const CATEGORY_ID = '55555555-5555-4555-8555-555555555555';
const money = (value: number) => ({ toNumber: () => value });
// O contrato da resposta exige id em formato UUID.
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P1 = uid(1);
const P2 = uid(2);
const HIDDEN = uid(3);
const O1 = uid(4);
const O2 = uid(5);
const NEW = uid(6);
const OLD_ONE = uid(7);
const OLD = new Date('2020-01-01T00:00:00.000Z');
const BUCKET = process.env.S3_PUBLIC_BASE_URL;

function storeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store-1',
    userId: USER_ID,
    storeName: 'Leal Perfumaria',
    handle: 'lealperfumaria',
    catalogLink: 'https://lealperfumaria.revendaja.com',
    isOnline: true,
    bio: null,
    plan: 'free',
    storefrontConfig: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const SETTINGS_ROW = {
  monthlyGoal: null,
  plan: 'free',
  acceptedPaymentMethods: ['pix', 'card', 'cash'],
  hideOutOfStock: true,
};

// A tabela `stores` é lida por handle (vitrine), por userId (painel) e por id (configurações/config).
function arrangeStore(store: Record<string, unknown> | null = storeRow()) {
  storeFindUnique.mockImplementation(
    ({
      where,
      select,
    }: {
      where: { handle?: string; userId?: string; id?: string };
      select?: Record<string, boolean>;
    }) => {
      if (where.handle)
        return Promise.resolve(store && where.handle === store.handle ? store : null);
      if (where.userId) return Promise.resolve(store);
      // Por id: ou as configurações (hideOutOfStock...) ou só a personalização.
      if (select?.storefrontConfig)
        return Promise.resolve(store ? { storefrontConfig: store.storefrontConfig ?? null } : null);
      return Promise.resolve(store ? SETTINGS_ROW : null);
    },
  );
}

function catalogRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    price: money(55),
    promoPrice: null,
    promoEndsAt: null,
    stock: 10,
    name: null,
    description: null,
    image: null,
    createdAt: OLD,
    category: null,
    product: {
      name: `Produto ${id}`,
      description: null,
      productImage: `https://img/${id}.jpg`,
      productImageSm: `https://img/${id}-sm.jpg`,
      brand: { id: 1, name: 'Natura' },
    },
    ...overrides,
  };
}

async function call(
  method: 'GET' | 'PUT',
  url: string,
  payload?: Record<string, unknown>,
  token: string | null = null,
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

function arrangeVerified() {
  userFindUnique.mockResolvedValue({
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    createdAt: new Date(),
  });
}

beforeEach(() => {
  [
    sessionFindUnique,
    userFindUnique,
    storeFindUnique,
    storeUpdate,
    storeProductFindMany,
    storeProductCount,
    saleItemGroupBy,
  ].forEach((mock) => mock.mockReset());
  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  arrangeStore();
  storeProductFindMany.mockResolvedValue([]);
  storeProductCount.mockResolvedValue(0);
  saleItemGroupBy.mockResolvedValue([]);
});

describe('GET /public/stores/:handle/home (página inicial da vitrine, sem login)', () => {
  it('abre sem token e traz os banners padrão quando a loja não personalizou nada', async () => {
    const response = await call('GET', '/public/stores/lealperfumaria/home');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.store).toEqual({
      storeName: 'Leal Perfumaria',
      handle: 'lealperfumaria',
      bio: null,
      acceptedPaymentMethods: ['pix', 'card', 'cash'],
      hideBranding: false,
    });
    expect(body.config.hero.title).toBe('Beleza e cuidado');
    expect(body.config.announcement.text).toContain('Leal Perfumaria');
    expect(body.config.benefits).toHaveLength(4);
    expect(body.config.collections).toHaveLength(2);
    expect(body.categories).toEqual([]);
    expect(body.featured).toEqual([]);
    expect(body.offers).toEqual({ products: [], endsAt: null });
    expect(body.newArrivals).toEqual([]);
  });

  it('mostra a personalização gravada pela loja', async () => {
    arrangeStore(
      storeRow({
        storefrontConfig: {
          hero: {
            badge: 'LIQUIDA',
            title: 'Tudo com desconto',
            highlight: 'só esta semana',
            subtitle: 'Aproveite.',
            primaryLabel: 'Comprar',
            secondaryLabel: 'Ofertas',
            imageUrl: null,
          },
        },
      }),
    );

    const response = await call('GET', '/public/stores/lealperfumaria/home');

    expect(response.json().config.hero.title).toBe('Tudo com desconto');
    expect(response.json().config.flash.title).toBe('Ofertas relâmpago');
  });

  it('plano Pro tira a marca do Revendajá', async () => {
    arrangeStore(storeRow({ plan: 'premium' }));

    const response = await call('GET', '/public/stores/lealperfumaria/home');

    expect(response.json().store.hideBranding).toBe(true);
  });

  it('não vaza dados internos (plano, ids, custo, estoque)', async () => {
    storeProductFindMany.mockResolvedValue([catalogRow('a')]);

    const response = await call('GET', '/public/stores/lealperfumaria/home');

    expect(JSON.stringify(response.json())).not.toMatch(
      /"plan"|userId|"id":"store-1"|cost|"stock"|catalogLink/i,
    );
  });

  it('loja inexistente: 404; desativada: 404 STORE_OFFLINE', async () => {
    arrangeStore(null);
    expect((await call('GET', '/public/stores/naoexiste/home')).statusCode).toBe(404);

    arrangeStore(storeRow({ isOnline: false }));
    const offline = await call('GET', '/public/stores/lealperfumaria/home');
    expect(offline.statusCode).toBe(404);
    expect(offline.json().error).toBe('STORE_OFFLINE');
  });

  describe('atalhos de categoria (do que a loja vende)', () => {
    it('agrupa por marca e por categoria própria, do maior para o menor, só com produto visível', async () => {
      storeProductFindMany.mockImplementation(({ select }: { select: Record<string, unknown> }) => {
        // A consulta de atalhos é a única que seleciona `category`.
        if (select.category) {
          return Promise.resolve([
            catalogRow('a', { category: { id: CATEGORY_ID, name: 'Presentes' } }),
            catalogRow('b'),
            catalogRow('c', {
              product: { ...catalogRow('c').product, brand: { id: 2, name: 'Boticário' } },
            }),
            catalogRow('d'),
          ]);
        }
        return Promise.resolve([]);
      });

      const response = await call('GET', '/public/stores/lealperfumaria/home');

      expect(response.json().categories).toEqual([
        { type: 'brand', id: '1', name: 'Natura', count: 3, image: 'https://img/a-sm.jpg' },
        { type: 'brand', id: '2', name: 'Boticário', count: 1, image: 'https://img/c-sm.jpg' },
        {
          type: 'category',
          id: CATEGORY_ID,
          name: 'Presentes',
          count: 1,
          image: 'https://img/a-sm.jpg',
        },
      ]);
    });

    it('produto manual sem marca só entra na categoria própria, usando a foto dele', async () => {
      storeProductFindMany.mockImplementation(({ select }: { select: Record<string, unknown> }) => {
        if (select.category) {
          return Promise.resolve([
            {
              ...catalogRow('m'),
              product: null,
              image: 'https://img/cesta.jpg',
              category: { id: CATEGORY_ID, name: 'Cestas' },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const response = await call('GET', '/public/stores/lealperfumaria/home');

      expect(response.json().categories).toEqual([
        {
          type: 'category',
          id: CATEGORY_ID,
          name: 'Cestas',
          count: 1,
          image: 'https://img/cesta.jpg',
        },
      ]);
    });

    it('só considera produto visível: ativo, não congelado e (se a loja pede) com estoque', async () => {
      await call('GET', '/public/stores/lealperfumaria/home');

      const categoriesQuery = storeProductFindMany.mock.calls.find(
        ([args]) => args.select.category,
      );
      expect(categoriesQuery?.[0].where).toEqual({
        storeId: 'store-1',
        isActive: true,
        frozen: false,
        stock: { gt: 0 },
      });
    });
  });

  describe('mais vendidos, ofertas e novidades', () => {
    it('destaques seguem a ordem das vendas e pulam o que não está visível', async () => {
      saleItemGroupBy.mockResolvedValue([
        { storeProductId: P2, _sum: { quantity: 9 } },
        { storeProductId: HIDDEN, _sum: { quantity: 5 } },
        { storeProductId: P1, _sum: { quantity: 3 } },
      ]);
      storeProductFindMany.mockImplementation(
        ({
          where,
          select,
        }: {
          where: { id?: { in?: string[] } };
          select: Record<string, unknown>;
        }) => {
          if (where.id?.in) {
            // HIDDEN não volta: está oculto/congelado/esgotado.
            return Promise.resolve([catalogRow(P1), catalogRow(P2)]);
          }
          return Promise.resolve(select.category ? [] : []);
        },
      );

      const response = await call('GET', '/public/stores/lealperfumaria/home');

      expect(response.json().featured.map((item: { id: string }) => item.id)).toEqual([P2, P1]);
    });

    it('vendas contadas: só da loja, pedidos não cancelados e dos últimos 90 dias', async () => {
      await call('GET', '/public/stores/lealperfumaria/home');

      const args = saleItemGroupBy.mock.calls[0][0];
      expect(args.where.sale.storeId).toBe('store-1');
      expect(args.where.sale.status).toEqual({ not: 'cancelled' });
      const days =
        (Date.now() - (args.where.sale.createdAt.gte as Date).getTime()) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThan(90.1);
    });

    it('ofertas: só promoção que ainda vale, com o fim da primeira a acabar', async () => {
      const endsSoon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      storeProductFindMany.mockImplementation(({ where }: { where: { promoPrice?: unknown } }) => {
        if (where.promoPrice) {
          return Promise.resolve([
            catalogRow(O1, { promoPrice: money(40), promoEndsAt: endsSoon }),
            catalogRow(O2, {
              promoPrice: money(30),
              promoEndsAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
            }),
          ]);
        }
        return Promise.resolve([]);
      });

      const response = await call('GET', '/public/stores/lealperfumaria/home');

      const { offers } = response.json();
      expect(offers.endsAt).toBe(endsSoon.toISOString());
      expect(offers.products.map((item: { id: string }) => item.id)).toEqual([O1, O2]);
      expect(offers.products[0]).toMatchObject({ price: 55, promoPrice: 40, isPromoActive: true });
      const query = storeProductFindMany.mock.calls.find(([args]) => args.where.promoPrice)?.[0];
      expect(query.where.promoPrice).toEqual({ not: null });
      expect(query.where.promoEndsAt.gt).toBeInstanceOf(Date);
      expect(query.orderBy).toEqual([{ promoEndsAt: 'asc' }, { id: 'asc' }]);
    });

    it('novidades: mais recentes primeiro, com selo "Novo" só nos cadastrados há pouco', async () => {
      storeProductFindMany.mockImplementation(({ orderBy }: { orderBy?: unknown }) => {
        if (JSON.stringify(orderBy) === JSON.stringify([{ createdAt: 'desc' }, { id: 'asc' }])) {
          return Promise.resolve([catalogRow(NEW, { createdAt: new Date() }), catalogRow(OLD_ONE)]);
        }
        return Promise.resolve([]);
      });

      const response = await call('GET', '/public/stores/lealperfumaria/home');

      const arrivals = response.json().newArrivals;
      expect(arrivals.map((item: { id: string }) => item.id)).toEqual([NEW, OLD_ONE]);
      expect(arrivals[0].isNew).toBe(true);
      expect(arrivals[1].isNew).toBe(false);
    });
  });
});

describe('GET /public/stores/:handle (filtro dos atalhos de categoria)', () => {
  it('filtra pela categoria própria da loja', async () => {
    await call('GET', `/public/stores/lealperfumaria?category=${CATEGORY_ID}`);

    expect(storeProductFindMany.mock.calls[0][0].where).toMatchObject({
      storeId: 'store-1',
      frozen: false,
      categoryId: CATEGORY_ID,
    });
  });

  it('filtra pela marca', async () => {
    await call('GET', '/public/stores/lealperfumaria?brand=7');

    expect(storeProductFindMany.mock.calls[0][0].where).toMatchObject({ product: { brandId: 7 } });
  });

  it('recusa categoria que não é UUID e marca inválida', async () => {
    expect((await call('GET', '/public/stores/lealperfumaria?category=abc')).statusCode).toBe(400);
    expect((await call('GET', '/public/stores/lealperfumaria?brand=-1')).statusCode).toBe(400);
  });
});

describe('Aparência da vitrine (painel, autenticada)', () => {
  const hero = {
    badge: 'LIQUIDA',
    title: 'Tudo com desconto',
    highlight: 'só esta semana',
    subtitle: 'Aproveite.',
    primaryLabel: 'Comprar',
    secondaryLabel: 'Ofertas',
    imageUrl: `${BUCKET}/users/u1/banners/x.jpg`,
  };

  it.each(['GET', 'PUT'] as const)('%s: 401 sem token', async (method) => {
    expect(
      (await call(method, '/store/storefront', method === 'PUT' ? { hero } : undefined)).statusCode,
    ).toBe(401);
  });

  it('403 com o e-mail não verificado', async () => {
    userFindUnique.mockResolvedValue({ id: USER_ID, phoneVerifiedAt: null });

    expect((await call('GET', '/store/storefront', undefined, TOKEN)).statusCode).toBe(403);
  });

  it('GET: devolve o que vale, os padrões e nada personalizado numa loja nova', async () => {
    arrangeVerified();

    const response = await call('GET', '/store/storefront', undefined, TOKEN);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.config).toEqual(body.defaults);
    expect(body.customized).toEqual({
      announcement: false,
      hero: false,
      benefits: false,
      flash: false,
      collections: false,
    });
  });

  it('PUT: grava a seção enviada na loja da usuária e devolve o resultado', async () => {
    arrangeVerified();

    const response = await call('PUT', '/store/storefront', { hero }, TOKEN);

    expect(response.statusCode).toBe(200);
    expect(storeUpdate).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { storefrontConfig: { hero } },
    });
    expect(response.json().config.hero.title).toBe('Tudo com desconto');
    expect(response.json().customized.hero).toBe(true);
  });

  it('PUT: null restaura o padrão da seção', async () => {
    arrangeVerified();
    arrangeStore(storeRow({ storefrontConfig: { hero } }));

    const response = await call('PUT', '/store/storefront', { hero: null }, TOKEN);

    expect(storeUpdate).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { storefrontConfig: {} },
    });
    expect(response.json().customized.hero).toBe(false);
    expect(response.json().config.hero.title).toBe('Beleza e cuidado');
  });

  it('PUT: dados inválidos dão 400 e não gravam nada', async () => {
    arrangeVerified();

    const tooLong = await call(
      'PUT',
      '/store/storefront',
      { hero: { ...hero, title: 'a'.repeat(61) } },
      TOKEN,
    );
    const empty = await call('PUT', '/store/storefront', {}, TOKEN);
    const external = await call(
      'PUT',
      '/store/storefront',
      { hero: { ...hero, imageUrl: 'https://rastreador.exemplo/x.png' } },
      TOKEN,
    );

    expect(tooLong.statusCode).toBe(400);
    expect(empty.statusCode).toBe(400);
    expect(external.statusCode).toBe(400);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('PUT: usuária sem loja recebe 404', async () => {
    arrangeVerified();
    arrangeStore(null);
    storeFindUnique.mockResolvedValue(null);

    const response = await call('PUT', '/store/storefront', { hero }, TOKEN);

    expect(response.statusCode).toBe(404);
    expect(storeUpdate).not.toHaveBeenCalled();
  });
});
