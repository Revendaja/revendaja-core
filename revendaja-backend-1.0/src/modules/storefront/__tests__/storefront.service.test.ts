import { StorefrontService } from '../storefront.service';
import type { OnlineOrderBody } from '../storefront.schema';
import type { Sale } from '../../sales/sales.types';
import type { Store, StoreSettings } from '../../store/store.types';
import { ConflictError, NotFoundError } from '../../../shared/errors/AppError';
import type { AppError } from '../../../shared/errors/AppError';

const NOW = new Date('2026-09-24T15:00:00.000Z');
const PRODUCT_A = '22222222-2222-4222-8222-222222222222';

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

function buildSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: 7,
    createdAt: new Date('2026-09-24T14:59:00.000Z'),
    status: 'pending',
    source: 'online',
    paymentMethod: 'pix',
    installments: null,
    total: 110,
    customerName: 'Bia Lima',
    customerWhatsapp: '5511987654321',
    fulfillment: 'pickup',
    deliveryAddress: null,
    cashChangeFor: null,
    items: [
      {
        storeProductId: PRODUCT_A,
        productName: 'Kaiak Aventura 100 ml',
        productImageSm: 'https://img/k.jpg',
        quantity: 2,
        unitPrice: 55,
        subtotal: 110,
      },
    ],
    ...overrides,
  };
}

function buildOrder(overrides: Partial<OnlineOrderBody> = {}): OnlineOrderBody {
  return {
    clientRequestId: '44444444-4444-4444-8444-444444444444',
    customerName: 'Bia Lima',
    customerWhatsapp: '5511987654321',
    fulfillment: 'pickup',
    paymentMethod: 'pix',
    items: [{ storeProductId: PRODUCT_A, quantity: 2 }],
    ...overrides,
  };
}

function build() {
  const stores = {
    findByHandle: jest.fn().mockResolvedValue(buildStore()),
    findByUserId: jest.fn().mockResolvedValue(buildStore()),
    getSettings: jest.fn().mockResolvedValue(SETTINGS),
  };
  const storefront = {
    recordVisit: jest.fn().mockResolvedValue(undefined),
    countVisitsSince: jest.fn().mockResolvedValue(0),
    listProducts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listCategories: jest.fn().mockResolvedValue([]),
    listBestSellers: jest.fn().mockResolvedValue([]),
    listOffers: jest.fn().mockResolvedValue({ products: [], endsAt: null }),
    listNewest: jest.fn().mockResolvedValue([]),
    getConfigOverrides: jest.fn().mockResolvedValue(null),
    setConfigOverrides: jest.fn().mockResolvedValue(undefined),
  };
  const orders = {
    createOnlineOrder: jest.fn().mockResolvedValue({ sale: buildSale(), created: true }),
  };
  const orderCounter = { countBySource: jest.fn().mockResolvedValue(0) };
  const service = new StorefrontService(stores, storefront, orders, orderCounter, () => NOW);
  return { stores, storefront, orders, orderCounter, service };
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.catch((e: unknown) => e)) as AppError;
}

describe('StorefrontService', () => {
  describe('loja inexistente ou desativada (vale para vitrine, visita e pedido)', () => {
    const calls: [string, (service: StorefrontService) => Promise<unknown>][] = [
      ['getStorefront', (s) => s.getStorefront('lealperfumaria', { page: 1, pageSize: 20 })],
      ['recordVisit', (s) => s.recordVisit('lealperfumaria')],
      ['createOrder', (s) => s.createOrder('lealperfumaria', buildOrder())],
    ];

    it.each(calls)('%s: handle que não existe dá 404 STORE_NOT_FOUND', async (_name, call) => {
      const { stores, service } = build();
      stores.findByHandle.mockResolvedValue(null);

      const error = await errorOf(call(service));

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('STORE_NOT_FOUND');
    });

    it.each(calls)('%s: loja desativada (offline) dá 404 STORE_OFFLINE', async (_name, call) => {
      const { stores, service } = build();
      stores.findByHandle.mockResolvedValue(buildStore({ isOnline: false }));

      const error = await errorOf(call(service));

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('STORE_OFFLINE');
    });

    it('loja desativada não registra visita nem cria pedido', async () => {
      const { stores, storefront, orders, service } = build();
      stores.findByHandle.mockResolvedValue(buildStore({ isOnline: false }));

      await errorOf(service.recordVisit('lealperfumaria'));
      await errorOf(service.createOrder('lealperfumaria', buildOrder()));

      expect(storefront.recordVisit).not.toHaveBeenCalled();
      expect(orders.createOnlineOrder).not.toHaveBeenCalled();
    });
  });

  describe('getStorefront', () => {
    it('devolve a loja, as formas de pagamento aceitas e a página de produtos', async () => {
      const { stores, storefront, service } = build();
      stores.getSettings.mockResolvedValue({
        ...SETTINGS,
        acceptedPaymentMethods: ['pix', 'cash'],
      });
      const item = {
        id: PRODUCT_A,
        name: 'Kaiak',
        description: null,
        brand: 'Natura',
        image: null,
        imageSm: null,
        price: 55,
        inStock: true,
      };
      storefront.listProducts.mockResolvedValue({ items: [item], total: 41 });

      const result = await service.getStorefront('lealperfumaria', { page: 2, pageSize: 20 });

      expect(result).toEqual({
        store: {
          storeName: 'Leal Perfumaria',
          handle: 'lealperfumaria',
          bio: null,
          acceptedPaymentMethods: ['pix', 'cash'],
        },
        products: { items: [item], page: 2, pageSize: 20, total: 41 },
      });
    });

    it.each([[true], [false]])(
      'repassa hideOutOfStock = %s da configuração da loja e a busca',
      async (hideOutOfStock) => {
        const { stores, storefront, service } = build();
        stores.getSettings.mockResolvedValue({ ...SETTINGS, hideOutOfStock });

        await service.getStorefront('lealperfumaria', { search: 'kaiak', page: 1, pageSize: 10 });

        expect(storefront.listProducts).toHaveBeenCalledWith('store-1', {
          hideOutOfStock,
          search: 'kaiak',
          page: 1,
          pageSize: 10,
        });
      },
    );
  });

  describe('recordVisit', () => {
    it('registra a visita na loja do handle', async () => {
      const { storefront, service } = build();

      await service.recordVisit('lealperfumaria');

      expect(storefront.recordVisit).toHaveBeenCalledWith('store-1');
    });
  });

  describe('createOrder', () => {
    it('cria o pedido na loja do handle e devolve o comprovante SEM ids internos nem WhatsApp', async () => {
      const { orders, service } = build();

      const { order, created } = await service.createOrder('lealperfumaria', buildOrder());

      expect(orders.createOnlineOrder).toHaveBeenCalledWith('store-1', buildOrder());
      expect(created).toBe(true);
      expect(order).toEqual({
        number: 7,
        status: 'pending',
        total: 110,
        paymentMethod: 'pix',
        installments: null,
        customerName: 'Bia Lima',
        fulfillment: 'pickup',
        deliveryAddress: null,
        cashChangeFor: null,
        createdAt: new Date('2026-09-24T14:59:00.000Z'),
        // 48 h depois de criado (prazo padrão): daí em diante o pedido é cancelado sozinho.
        expiresAt: new Date('2026-09-26T14:59:00.000Z'),
        items: [
          { productName: 'Kaiak Aventura 100 ml', quantity: 2, unitPrice: 55, subtotal: 110 },
        ],
      });
    });

    it('mesmo clientRequestId: devolve o MESMO pedido com created = false', async () => {
      const { orders, service } = build();
      orders.createOnlineOrder.mockResolvedValue({
        sale: buildSale({ number: 3 }),
        created: false,
      });

      const result = await service.createOrder('lealperfumaria', buildOrder());

      expect(result.created).toBe(false);
      expect(result.order.number).toBe(3);
    });

    it('recusa forma de pagamento que a loja não aceita (400) e não cria o pedido', async () => {
      const { stores, orders, service } = build();
      stores.getSettings.mockResolvedValue({ ...SETTINGS, acceptedPaymentMethods: ['pix'] });

      const error = await errorOf(
        service.createOrder('lealperfumaria', buildOrder({ paymentMethod: 'cash' })),
      );

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('PAYMENT_METHOD_NOT_ACCEPTED');
      expect(orders.createOnlineOrder).not.toHaveBeenCalled();
    });

    it('aceita a forma de pagamento que a loja habilitou', async () => {
      const { stores, orders, service } = build();
      stores.getSettings.mockResolvedValue({ ...SETTINGS, acceptedPaymentMethods: ['cash'] });

      await service.createOrder('lealperfumaria', buildOrder({ paymentMethod: 'cash' }));

      expect(orders.createOnlineOrder).toHaveBeenCalled();
    });

    it('propaga o erro de estoque insuficiente (409) e de produto indisponível (404)', async () => {
      const { orders, service } = build();
      orders.createOnlineOrder.mockRejectedValueOnce(new ConflictError('Estoque insuficiente.'));
      orders.createOnlineOrder.mockRejectedValueOnce(new NotFoundError('Indisponível.'));

      await expect(service.createOrder('lealperfumaria', buildOrder())).rejects.toBeInstanceOf(
        ConflictError,
      );
      await expect(service.createOrder('lealperfumaria', buildOrder())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('getStats', () => {
    it('lança NotFoundError quando a usuária não tem loja', async () => {
      const { stores, service } = build();
      stores.findByUserId.mockResolvedValue(null);

      await expect(service.getStats('user-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('conta as visitas dos últimos 7 dias e todos os pedidos online da loja', async () => {
      const { storefront, orderCounter, service } = build();
      storefront.countVisitsSince.mockResolvedValue(184);
      orderCounter.countBySource.mockResolvedValue(13);

      const stats = await service.getStats('user-1');

      expect(stats).toEqual({ visitsLast7Days: 184, ordersCount: 13 });
      // Janela móvel de 7 dias (168 h) até agora.
      expect(storefront.countVisitsSince).toHaveBeenCalledWith(
        'store-1',
        new Date('2026-09-17T15:00:00.000Z'),
      );
      expect(orderCounter.countBySource).toHaveBeenCalledWith('store-1', 'online');
    });

    it('loja sem visitas nem pedidos: zeros', async () => {
      const { service } = build();

      await expect(service.getStats('user-1')).resolves.toEqual({
        visitsLast7Days: 0,
        ordersCount: 0,
      });
    });

    it('a estatística é da loja da usuária mesmo se ela estiver desativada (ela precisa ver os números)', async () => {
      const { stores, service } = build();
      stores.findByUserId.mockResolvedValue(buildStore({ isOnline: false }));

      await expect(service.getStats('user-1')).resolves.toBeDefined();
    });
  });
});
