import { StorefrontService } from '../storefront.service';
import { buildDefaultConfig } from '../storefront.config';
import type { Store, StoreSettings } from '../../store/store.types';
import type { StorefrontProduct } from '../storefront.types';
import { NotFoundError } from '../../../shared/errors/AppError';
import type { AppError } from '../../../shared/errors/AppError';

const NOW = new Date('2026-10-17T15:00:00.000Z');

function buildStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-1',
    userId: 'user-1',
    storeName: 'Leal Perfumaria',
    handle: 'lealperfumaria',
    catalogLink: 'https://lealperfumaria.revendaja.com',
    isOnline: true,
    bio: null,
    plan: 'free',
    defaultMinStock: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

const SETTINGS: StoreSettings = {
  monthlyGoal: null,
  plan: 'free',
  acceptedPaymentMethods: ['pix', 'card', 'cash'],
  hideOutOfStock: true,
};

function product(id: string, overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    id,
    name: `Produto ${id}`,
    description: null,
    brand: 'Natura',
    image: null,
    imageSm: null,
    price: 50,
    promoPrice: null,
    isPromoActive: false,
    inStock: true,
    isNew: false,
    ...overrides,
  };
}

function many(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => product(`${prefix}${index}`));
}

function build() {
  const stores = {
    findByHandle: jest.fn().mockResolvedValue(buildStore()),
    findByUserId: jest.fn().mockResolvedValue(buildStore()),
    getSettings: jest.fn().mockResolvedValue(SETTINGS),
  };
  const storefront = {
    recordVisit: jest.fn(),
    countVisitsSince: jest.fn(),
    listProducts: jest.fn(),
    listCategories: jest.fn().mockResolvedValue([]),
    listBestSellers: jest.fn().mockResolvedValue([]),
    listOffers: jest.fn().mockResolvedValue({ products: [], endsAt: null }),
    listNewest: jest.fn().mockResolvedValue([]),
    getConfigOverrides: jest.fn().mockResolvedValue(null),
    setConfigOverrides: jest.fn().mockResolvedValue(undefined),
  };
  const orders = { createOnlineOrder: jest.fn() };
  const orderCounter = { countBySource: jest.fn() };
  const service = new StorefrontService(stores, storefront, orders, orderCounter, () => NOW);
  return { stores, storefront, service };
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.catch((e: unknown) => e)) as AppError;
}

describe('StorefrontService#getHome', () => {
  it('uma loja sem personalização recebe os banners e textos padrão', async () => {
    const { service } = build();

    const home = await service.getHome('lealperfumaria');

    expect(home.config).toEqual(buildDefaultConfig('Leal Perfumaria'));
  });

  it('mostra a personalização da loja no lugar do padrão, só nas seções alteradas', async () => {
    const { storefront, service } = build();
    const hero = { ...buildDefaultConfig('X').hero, title: 'Meu título' };
    storefront.getConfigOverrides.mockResolvedValue({ hero });

    const home = await service.getHome('lealperfumaria');

    expect(home.config.hero.title).toBe('Meu título');
    expect(home.config.flash).toEqual(buildDefaultConfig('Leal Perfumaria').flash);
  });

  it('personalização gravada com formato inválido não derruba a vitrine (cai no padrão)', async () => {
    const { storefront, service } = build();
    storefront.getConfigOverrides.mockResolvedValue({ hero: { title: 123 } });

    const home = await service.getHome('lealperfumaria');

    expect(home.config.hero).toEqual(buildDefaultConfig('Leal Perfumaria').hero);
  });

  it('as seções vêm do estoque da loja, respeitando "esconder sem estoque"', async () => {
    const { storefront, service } = build();

    await service.getHome('lealperfumaria');

    expect(storefront.listCategories).toHaveBeenCalledWith('store-1', true);
    expect(storefront.listBestSellers).toHaveBeenCalledWith('store-1', true, 8, NOW);
    expect(storefront.listOffers).toHaveBeenCalledWith('store-1', true, 8, NOW);
    // Novidades: 8 mais novos, sem repetir os destaques (aqui não há nenhum).
    expect(storefront.listNewest).toHaveBeenCalledWith('store-1', true, 8, NOW, []);
  });

  it('loja que não esconde produto esgotado pede as seções sem esse filtro', async () => {
    const { stores, storefront, service } = build();
    stores.getSettings.mockResolvedValue({ ...SETTINGS, hideOutOfStock: false });

    await service.getHome('lealperfumaria');

    expect(storefront.listCategories).toHaveBeenCalledWith('store-1', false);
  });

  it('devolve ofertas com o fim da promoção mais próxima, e as novidades', async () => {
    const { storefront, service } = build();
    const endsAt = new Date('2026-10-20T00:00:00.000Z');
    storefront.listOffers.mockResolvedValue({ products: many('o', 2), endsAt });
    storefront.listNewest.mockResolvedValue(many('n', 3));

    const home = await service.getHome('lealperfumaria');

    expect(home.offers.endsAt).toEqual(endsAt);
    expect(home.offers.products).toHaveLength(2);
    expect(home.newArrivals).toHaveLength(3);
  });

  describe('destaques (mais vendidos)', () => {
    it('com 8 ou mais vendidos, usa só eles', async () => {
      const { storefront, service } = build();
      storefront.listBestSellers.mockResolvedValue(many('b', 8));

      const home = await service.getHome('lealperfumaria');

      expect(home.featured).toHaveLength(8);
      // Só a chamada das novidades; não precisou completar.
      expect(storefront.listNewest).toHaveBeenCalledTimes(1);
    });

    it('loja nova (sem vendas) completa os destaques com os produtos mais novos', async () => {
      const { storefront, service } = build();
      storefront.listBestSellers.mockResolvedValue([]);
      storefront.listNewest.mockResolvedValueOnce(many('n', 8)).mockResolvedValueOnce([]);

      const home = await service.getHome('lealperfumaria');

      expect(home.featured.map((item) => item.id)).toEqual(many('n', 8).map((item) => item.id));
    });

    it('poucos vendidos: mantém os vendidos primeiro e completa sem repetir', async () => {
      const { storefront, service } = build();
      storefront.listBestSellers.mockResolvedValue(many('b', 3));
      storefront.listNewest.mockResolvedValueOnce(many('f', 5)).mockResolvedValueOnce([]);

      const home = await service.getHome('lealperfumaria');

      expect(home.featured.map((item) => item.id)).toEqual([
        'b0',
        'b1',
        'b2',
        'f0',
        'f1',
        'f2',
        'f3',
        'f4',
      ]);
      expect(storefront.listNewest).toHaveBeenNthCalledWith(1, 'store-1', true, 5, NOW, [
        'b0',
        'b1',
        'b2',
      ]);
    });

    it('as novidades não repetem os produtos que já estão nos destaques', async () => {
      const { storefront, service } = build();
      storefront.listBestSellers.mockResolvedValue(many('b', 8));
      storefront.listNewest.mockResolvedValue(many('n', 4));

      const home = await service.getHome('lealperfumaria');

      expect(storefront.listNewest).toHaveBeenCalledWith(
        'store-1',
        true,
        8,
        NOW,
        many('b', 8).map((item) => item.id),
      );
      expect(home.newArrivals).toHaveLength(4);
    });
  });

  describe('atalhos de categoria', () => {
    it('devolve o que a loja vende (categorias próprias e marcas)', async () => {
      const { storefront, service } = build();
      storefront.listCategories.mockResolvedValue([
        { type: 'brand', id: '1', name: 'Natura', count: 12, image: 'https://img/n.jpg' },
        { type: 'category', id: 'c1', name: 'Presentes', count: 4, image: null },
      ]);

      const home = await service.getHome('lealperfumaria');

      expect(home.categories.map((item) => item.name)).toEqual(['Natura', 'Presentes']);
    });

    it('limita a 12 atalhos', async () => {
      const { storefront, service } = build();
      storefront.listCategories.mockResolvedValue(
        Array.from({ length: 20 }, (_, index) => ({
          type: 'brand' as const,
          id: String(index),
          name: `Marca ${index}`,
          count: 20 - index,
          image: null,
        })),
      );

      const home = await service.getHome('lealperfumaria');

      expect(home.categories).toHaveLength(12);
    });
  });

  describe('marca do Revendajá', () => {
    it.each([
      ['free', false],
      ['starter', false],
      ['premium', true],
      ['business', true],
    ] as const)('plano %s: hideBranding = %s', async (plan, expected) => {
      const { stores, service } = build();
      stores.findByHandle.mockResolvedValue(buildStore({ plan }));

      const home = await service.getHome('lealperfumaria');

      expect(home.store.hideBranding).toBe(expected);
    });
  });

  it('não vaza o plano nem o id da loja', async () => {
    const { service } = build();

    const home = await service.getHome('lealperfumaria');

    expect(Object.keys(home.store).sort()).toEqual([
      'acceptedPaymentMethods',
      'bio',
      'handle',
      'hideBranding',
      'storeName',
    ]);
  });

  it('loja inexistente: 404 STORE_NOT_FOUND', async () => {
    const { stores, service } = build();
    stores.findByHandle.mockResolvedValue(null);

    const error = await errorOf(service.getHome('naoexiste'));

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('STORE_NOT_FOUND');
  });

  it('loja desativada: 404 STORE_OFFLINE', async () => {
    const { stores, service } = build();
    stores.findByHandle.mockResolvedValue(buildStore({ isOnline: false }));

    const error = await errorOf(service.getHome('lealperfumaria'));

    expect(error.code).toBe('STORE_OFFLINE');
  });
});

describe('StorefrontService#getCustomization / updateCustomization', () => {
  const hero = { ...buildDefaultConfig('Leal Perfumaria').hero, title: 'Meu título' };

  it('mostra o que vale, os padrões e quais seções foram personalizadas', async () => {
    const { storefront, service } = build();
    storefront.getConfigOverrides.mockResolvedValue({ hero });

    const result = await service.getCustomization('user-1');

    expect(result.config.hero.title).toBe('Meu título');
    expect(result.defaults).toEqual(buildDefaultConfig('Leal Perfumaria'));
    expect(result.customized).toEqual({
      announcement: false,
      hero: true,
      benefits: false,
      flash: false,
      collections: false,
    });
  });

  it('usuária sem loja: NotFoundError', async () => {
    const { stores, service } = build();
    stores.findByUserId.mockResolvedValue(null);

    await expect(service.getCustomization('user-1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updateCustomization('user-1', { hero })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('grava só a seção enviada, mantendo as personalizações anteriores', async () => {
    const { storefront, service } = build();
    const flash = { ...buildDefaultConfig('Leal Perfumaria').flash, title: 'Black Friday' };
    storefront.getConfigOverrides.mockResolvedValue({ flash });

    const result = await service.updateCustomization('user-1', { hero });

    expect(storefront.setConfigOverrides).toHaveBeenCalledWith('store-1', { flash, hero });
    expect(result.config.hero.title).toBe('Meu título');
    expect(result.config.flash.title).toBe('Black Friday');
    expect(result.customized.hero).toBe(true);
    expect(result.customized.flash).toBe(true);
  });

  it('null restaura o padrão da seção e a devolve como não personalizada', async () => {
    const { storefront, service } = build();
    storefront.getConfigOverrides.mockResolvedValue({ hero });

    const result = await service.updateCustomization('user-1', { hero: null });

    expect(storefront.setConfigOverrides).toHaveBeenCalledWith('store-1', {});
    expect(result.config.hero).toEqual(buildDefaultConfig('Leal Perfumaria').hero);
    expect(result.customized.hero).toBe(false);
  });

  it('dado antigo inválido no banco é descartado ao salvar uma seção nova', async () => {
    const { storefront, service } = build();
    storefront.getConfigOverrides.mockResolvedValue({ benefits: 'quebrado' });

    await service.updateCustomization('user-1', { hero });

    expect(storefront.setConfigOverrides).toHaveBeenCalledWith('store-1', { hero });
  });
});
