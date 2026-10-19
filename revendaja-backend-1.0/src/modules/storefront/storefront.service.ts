import type { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { salesRepository, type SalesRepository } from '../sales/sales.repository';
import { salesService, type SalesService } from '../sales/sales.service';
import type { Sale } from '../sales/sales.types';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import type { Store } from '../store/store.types';
import { storefrontRepository, type StorefrontRepository } from './storefront.repository';
import type { OnlineOrderBody, StorefrontQuery } from './storefront.schema';
import {
  applyConfigUpdate,
  buildDefaultConfig,
  customizedSections,
  parseOverrides,
  resolveConfig,
  type UpdateStorefrontConfigInput,
} from './storefront.config';
import type {
  OnlineOrderReceipt,
  Storefront,
  StorefrontCustomization,
  StorefrontHome,
  StoreStats,
} from './storefront.types';

type StoreQueries = Pick<StoreRepository, 'findByHandle' | 'findByUserId' | 'getSettings'>;
type StorefrontQueries = Pick<
  StorefrontRepository,
  | 'recordVisit'
  | 'countVisitsSince'
  | 'listProducts'
  | 'listCategories'
  | 'listBestSellers'
  | 'listOffers'
  | 'listNewest'
  | 'getConfigOverrides'
  | 'setConfigOverrides'
>;
type OrderService = Pick<SalesService, 'createOnlineOrder'>;
type OrderCounter = Pick<SalesRepository, 'countBySource'>;

const STATS_WINDOW_DAYS = 7;
// Quantos produtos cada seção da página inicial mostra.
const HOME_SECTION_SIZE = 8;
const HOME_CATEGORIES_MAX = 12;
// Planos que tiram a marca do Revendajá do rodapé da vitrine.
const WHITE_LABEL_PLANS: readonly string[] = ['premium', 'business'];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function toReceipt(sale: Sale, expirationHours: number): OnlineOrderReceipt {
  return {
    number: sale.number,
    status: sale.status,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    installments: sale.installments,
    customerName: sale.customerName,
    // Todo pedido online grava a forma de recebimento; o `?? 'pickup'` cobre só dados antigos.
    fulfillment: sale.fulfillment ?? 'pickup',
    deliveryAddress: sale.deliveryAddress,
    cashChangeFor: sale.cashChangeFor,
    createdAt: sale.createdAt,
    expiresAt: new Date(sale.createdAt.getTime() + expirationHours * HOUR_MS),
    items: sale.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
  };
}

export class StorefrontService {
  constructor(
    private readonly stores: StoreQueries = storeRepository,
    private readonly storefront: StorefrontQueries = storefrontRepository,
    private readonly orders: OrderService = salesService,
    private readonly orderCounter: OrderCounter = salesRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly orderExpirationHours: number = env.ONLINE_ORDER_EXPIRATION_HOURS,
  ) {}

  // Catálogo público da loja: produtos visíveis, com preço, e as formas de pagamento aceitas.
  async getStorefront(handle: string, query: StorefrontQuery): Promise<Storefront> {
    const store = await this.getOpenStoreOrThrow(handle);
    const settings = await this.stores.getSettings(store.id);
    if (!settings) throw storeNotFound();

    const { items, total } = await this.storefront.listProducts(store.id, {
      hideOutOfStock: settings.hideOutOfStock,
      search: query.search,
      categoryId: query.category,
      brandId: query.brand,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      store: {
        storeName: store.storeName,
        handle: store.handle,
        bio: store.bio,
        acceptedPaymentMethods: settings.acceptedPaymentMethods,
      },
      products: { items, page: query.page, pageSize: query.pageSize, total },
    };
  }

  // Página inicial da vitrine: banners e textos (padrão ou personalizados) + seções montadas com o
  // estoque da loja (atalhos de categoria, mais vendidos, ofertas e novidades).
  async getHome(handle: string): Promise<StorefrontHome> {
    const store = await this.getOpenStoreOrThrow(handle);
    const settings = await this.stores.getSettings(store.id);
    if (!settings) throw storeNotFound();

    const hide = settings.hideOutOfStock;
    const now = this.now();
    const [overrides, categories, bestSellers, offers] = await Promise.all([
      this.storefront.getConfigOverrides(store.id),
      this.storefront.listCategories(store.id, hide),
      this.storefront.listBestSellers(store.id, hide, HOME_SECTION_SIZE, now),
      this.storefront.listOffers(store.id, hide, HOME_SECTION_SIZE, now),
    ]);

    // Loja nova ainda não tem vendas: os destaques se completam com os produtos mais novos.
    let featured = bestSellers;
    if (featured.length < HOME_SECTION_SIZE) {
      const filler = await this.storefront.listNewest(
        store.id,
        hide,
        HOME_SECTION_SIZE - featured.length,
        now,
        featured.map((product) => product.id),
      );
      featured = [...featured, ...filler];
    }

    // As novidades não repetem o que já está nos destaques (numa loja pequena a seção some em vez
    // de mostrar os mesmos produtos duas vezes).
    const newArrivals = await this.storefront.listNewest(
      store.id,
      hide,
      HOME_SECTION_SIZE,
      now,
      featured.map((product) => product.id),
    );

    return {
      store: {
        storeName: store.storeName,
        handle: store.handle,
        bio: store.bio,
        acceptedPaymentMethods: settings.acceptedPaymentMethods,
        hideBranding: WHITE_LABEL_PLANS.includes(store.plan),
      },
      config: resolveConfig(store.storeName, overrides),
      categories: categories.slice(0, HOME_CATEGORIES_MAX),
      featured,
      offers,
      newArrivals,
    };
  }

  // Aparência da vitrine (painel): o que está valendo, os padrões e o que a loja personalizou.
  async getCustomization(userId: string): Promise<StorefrontCustomization> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.buildCustomization(
      store.storeName,
      await this.storefront.getConfigOverrides(store.id),
    );
  }

  // Só grava o que a loja mudou: seção preenchida = personalizada; `null` = volta ao padrão.
  async updateCustomization(
    userId: string,
    input: UpdateStorefrontConfigInput,
  ): Promise<StorefrontCustomization> {
    const store = await this.getOwnStoreOrThrow(userId);
    const current = parseOverrides(await this.storefront.getConfigOverrides(store.id));
    const next = applyConfigUpdate(current, input);
    await this.storefront.setConfigOverrides(store.id, next as Prisma.InputJsonObject);
    return this.buildCustomization(store.storeName, next);
  }

  private buildCustomization(storeName: string, stored: unknown): StorefrontCustomization {
    const overrides = parseOverrides(stored);
    return {
      config: resolveConfig(storeName, overrides),
      defaults: buildDefaultConfig(storeName),
      customized: customizedSections(overrides),
    };
  }

  private async getOwnStoreOrThrow(userId: string): Promise<Store> {
    const store = await this.stores.findByUserId(userId);
    if (!store) throw new NotFoundError('Você ainda não possui uma loja.');
    return store;
  }

  // O revendaja-web chama uma vez por visita (ao abrir a vitrine). Só conta com a loja online.
  async recordVisit(handle: string): Promise<void> {
    const store = await this.getOpenStoreOrThrow(handle);
    await this.storefront.recordVisit(store.id);
  }

  // Pedido do cliente: vira uma venda PENDENTE da loja online (a loja confirma o pagamento depois).
  // `created` é false quando o `clientRequestId` já tinha um pedido (repetição do site).
  async createOrder(
    handle: string,
    input: OnlineOrderBody,
  ): Promise<{ order: OnlineOrderReceipt; created: boolean }> {
    const store = await this.getOpenStoreOrThrow(handle);
    const settings = await this.stores.getSettings(store.id);
    if (!settings) throw storeNotFound();

    if (!settings.acceptedPaymentMethods.includes(input.paymentMethod)) {
      throw new AppError(
        'Esta loja não aceita esta forma de pagamento.',
        400,
        'PAYMENT_METHOD_NOT_ACCEPTED',
      );
    }

    const { sale, created } = await this.orders.createOnlineOrder(store.id, input);
    return { order: toReceipt(sale, this.orderExpirationHours), created };
  }

  // Números da tela Minha Loja (da loja da usuária autenticada).
  async getStats(userId: string): Promise<StoreStats> {
    const store = await this.stores.findByUserId(userId);
    if (!store) {
      throw new NotFoundError('Você ainda não possui uma loja.');
    }

    const since = new Date(this.now().getTime() - STATS_WINDOW_DAYS * DAY_MS);
    const [visitsLast7Days, ordersCount] = await Promise.all([
      this.storefront.countVisitsSince(store.id, since),
      this.orderCounter.countBySource(store.id, 'online'),
    ]);

    return { visitsLast7Days, ordersCount };
  }

  // Loja desativada (`isOnline = false`) some da vitrine: nada público funciona, nem visita nem pedido.
  private async getOpenStoreOrThrow(handle: string): Promise<Store> {
    const store = await this.stores.findByHandle(handle);
    if (!store) throw storeNotFound();
    if (!store.isOnline) {
      throw new AppError('Esta loja está temporariamente indisponível.', 404, 'STORE_OFFLINE');
    }
    return store;
  }
}

function storeNotFound(): AppError {
  return new AppError('Loja não encontrada.', 404, 'STORE_NOT_FOUND');
}

export const storefrontService = new StorefrontService();
