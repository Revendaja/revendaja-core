import type { Prisma } from '@prisma/client';
import { isUniqueViolation } from '../../database/errors';
import { prisma } from '../../database/prisma';
import type { CatalogProduct } from '../catalog/catalog.types';
import { mapCatalogProduct } from '../catalog/catalog.repository';
import { buildProductSearchFilter, findFuzzyStoreProductIds } from '../catalog/catalog.search';
import { withCatalogLink } from './store.link';
import type { SortOption } from './store.schema';
import type {
  AcceptedPaymentMethod,
  CreateStoreResult,
  LowStockCandidate,
  LowStockProduct,
  Store,
  StoreCategory,
  StoreGoalCandidate,
  StoreProduct,
  StoreProductComponentView,
  StoreChanges,
  StorePromotionCandidate,
  StoreSettings,
  StoreSettingsChanges,
  UpdateStoreResult,
} from './store.types';

interface CreateStoreData {
  userId: string;
  storeName: string;
  handle: string;
  catalogLink: string;
}

interface CreateStoreProductData {
  storeId: string;
  productId: number;
  price: number;
  costPrice?: number | null;
  stock: number;
  minStock?: number;
}

interface ComponentInput {
  componentId: string;
  quantity: number;
}

interface CreateManualStoreProductData {
  storeId: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  costPrice?: number | null;
  stock: number;
  minStock?: number;
  components?: ComponentInput[];
}

interface UpdateStoreProductData {
  price?: number;
  costPrice?: number | null;
  stock?: number;
  minStock?: number;
  isActive?: boolean;
  categoryId?: string | null;
  promoPrice?: number | null;
  promoEndsAt?: Date | null;
  name?: string;
  description?: string | null;
  image?: string | null;
  // undefined = não mexe nos componentes; array (mesmo vazio) = substitui a lista inteira.
  components?: ComponentInput[];
}

interface ListStoreProductsFilter {
  search?: string;
  categoryId?: string;
  sort: SortOption;
  page: number;
  pageSize: number;
}

// Só 1 nível de componente (sem kit-dentro-de-kit): não precisa incluir `components` do componente.
const COMPONENT_INCLUDE = {
  component: { include: { product: { include: { brand: true } } } },
} satisfies Prisma.StoreProductComponentInclude;

const STORE_PRODUCT_INCLUDE = {
  product: { include: { brand: true } },
  category: true,
  components: { include: COMPONENT_INCLUDE },
} satisfies Prisma.StoreProductInclude;

type StoreProductWithCatalog = Prisma.StoreProductGetPayload<{
  include: typeof STORE_PRODUCT_INCLUDE;
}>;

type ComponentRow = Prisma.StoreProductComponentGetPayload<{ include: typeof COMPONENT_INCLUDE }>;

const MANUAL_BRAND_NAME = 'Produto Próprio';

// Um produto do catálogo (`kind: 'catalog'`) devolve o `Product` de verdade; um produto manual
// (`kind: 'manual'`) não tem vínculo com o catálogo, então sintetizamos um `CatalogProduct` com os
// campos próprios do StoreProduct — assim as telas que já leem `item.product.*` continuam
// funcionando sem mudança nenhuma pros dois casos.
function toDisplayProduct(row: {
  productId: number | null;
  product: Prisma.ProductGetPayload<{ include: { brand: true } }> | null;
  name: string | null;
  description: string | null;
  image: string | null;
}): CatalogProduct {
  if (row.productId !== null && row.product) {
    return mapCatalogProduct(row.product);
  }
  return {
    id: null,
    name: row.name ?? '',
    barCode: null,
    brandSku: null,
    description: row.description,
    productImage: row.image,
    productImageSm: row.image,
    basePrice: 0,
    brand: { id: null, name: MANUAL_BRAND_NAME, logo: null, profitability: 0 },
  };
}

function mapComponent(row: ComponentRow): StoreProductComponentView {
  const display = toDisplayProduct(row.component);
  return {
    id: row.id,
    storeProductId: row.componentId,
    name: display.name,
    image: display.productImageSm,
    price: row.component.price.toNumber(),
    stock: row.component.stock,
    quantity: row.quantity,
  };
}

const SETTINGS_SELECT = {
  monthlyGoal: true,
  plan: true,
  acceptedPaymentMethods: true,
  hideOutOfStock: true,
} satisfies Prisma.StoreSelect;

type SettingsRow = Prisma.StoreGetPayload<{ select: typeof SETTINGS_SELECT }>;

function mapSettings(row: SettingsRow): StoreSettings {
  return {
    monthlyGoal: row.monthlyGoal?.toNumber() ?? null,
    plan: row.plan,
    // O enum do banco ainda tem `on_account` (vendas antigas), mas fiado não é uma forma de pagamento aceita.
    acceptedPaymentMethods: row.acceptedPaymentMethods.filter(
      (method): method is AcceptedPaymentMethod => method !== 'on_account',
    ),
    hideOutOfStock: row.hideOutOfStock,
  };
}

function mapStoreProduct(row: StoreProductWithCatalog): StoreProduct {
  const promoPrice = row.promoPrice?.toNumber() ?? null;
  const promoEndsAt = row.promoEndsAt;
  return {
    id: row.id,
    storeId: row.storeId,
    kind: row.kind,
    price: row.price.toNumber(),
    costPrice: row.costPrice?.toNumber() ?? null,
    promoPrice,
    promoEndsAt,
    // Calculado aqui (não guardado no banco): "ainda vale?" depende só de comparar com o agora.
    isPromoActive: promoPrice !== null && promoEndsAt !== null && promoEndsAt > new Date(),
    stock: row.stock,
    minStock: row.minStock,
    isActive: row.isActive,
    isFrozen: row.frozen,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    product: toDisplayProduct(row),
    category: row.category ? { id: row.category.id, name: row.category.name } : null,
    components: row.components.map(mapComponent),
  };
}

// Produto de catálogo tem nome em `product.name` (relação); produto manual tem nome próprio
// (`name`). Ordenar por nome usa os dois campos como chaves em sequência: os produtos de catálogo
// ficam ordenados entre si corretamente (relação nula do lado dos manuais empurra todos pro mesmo
// bloco, que o Postgres ordena ao final/início do grupo), e dentro desse bloco os manuais ficam
// ordenados entre si pelo próprio `name`. Não é uma intercalação perfeita entre os dois tipos, mas
// evita reescrever a consulta em SQL cru só por causa do nome — produto manual é a exceção aqui.
function buildOrderBy(sort: SortOption): Prisma.StoreProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'name_asc':
      return [{ product: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }];
    case 'name_desc':
      return [{ product: { name: 'desc' } }, { name: 'desc' }, { id: 'asc' }];
    case 'price_asc':
      return [{ price: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ price: 'desc' }, { id: 'asc' }];
    case 'stock_asc':
      return [{ stock: 'asc' }, { id: 'asc' }];
    case 'recent':
    default:
      return [{ createdAt: 'desc' }];
  }
}

export const storeRepository = {
  findByUserId(userId: string): Promise<Store | null> {
    return prisma.store
      .findUnique({ where: { userId } })
      .then((store) => (store ? withCatalogLink(store) : null));
  },

  findByHandle(handle: string): Promise<Store | null> {
    return prisma.store
      .findUnique({ where: { handle } })
      .then((store) => (store ? withCatalogLink(store) : null));
  },

  // `findByUserId` (uma loja por conta) já é checado antes (ver StoreService#createStore), mas isso
  // é check-then-insert: duas requisições concorrentes passam a checagem e só uma grava — a outra
  // estoura um índice único aqui (userId OU o handle, escolhido por `generateUniqueHandle` também
  // por checagem prévia). Devolve `already_exists` em vez de deixar o P2002 subir como 500.
  async create(data: CreateStoreData): Promise<CreateStoreResult> {
    try {
      const store = await prisma.store.create({ data });
      return { kind: 'created', store: withCatalogLink(store) };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'already_exists' };
      throw error;
    }
  },

  // Só grava o que veio em `changes`. Se o `handle` novo colidir com o de outra loja (índice único),
  // devolve `handle_taken` em vez de estourar.
  async updateStore(storeId: string, changes: StoreChanges): Promise<UpdateStoreResult> {
    try {
      const store = await prisma.store.update({ where: { id: storeId }, data: changes });
      return { kind: 'updated', store: withCatalogLink(store) };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'handle_taken' };
      throw error;
    }
  },

  // Quando a loja troca o defaultMinStock, aplica o valor NOVO em quem ainda está no valor ANTIGO —
  // ou seja, produto que a loja nunca configurou um mínimo próprio "segue" o padrão. Não toca em
  // quem já foi customizado individualmente (minStock diferente do antigo padrão): esse fica como a
  // loja deixou. Devolve quantos produtos foram atualizados.
  async applyDefaultMinStockToExisting(
    storeId: string,
    previousDefault: number,
    newDefault: number,
  ): Promise<number> {
    const result = await prisma.storeProduct.updateMany({
      where: { storeId, minStock: previousDefault },
      data: { minStock: newDefault },
    });
    return result.count;
  },

  // Meta, plano e configurações da loja, numa consulta só (o tipo `Store` não os carrega de
  // propósito: só a Home, a tela Mais e `PUT /store/goal` os usam). null = a loja não existe.
  async getSettings(storeId: string): Promise<StoreSettings | null> {
    const row = await prisma.store.findUnique({
      where: { id: storeId },
      select: SETTINGS_SELECT,
    });
    return row ? mapSettings(row) : null;
  },

  // Só grava o que veio em `changes`. Devolve as configurações já atualizadas.
  async updateSettings(storeId: string, changes: StoreSettingsChanges): Promise<StoreSettings> {
    const row = await prisma.store.update({
      where: { id: storeId },
      data: {
        ...(changes.acceptedPaymentMethods
          ? { acceptedPaymentMethods: { set: changes.acceptedPaymentMethods } }
          : {}),
        ...(changes.hideOutOfStock !== undefined ? { hideOutOfStock: changes.hideOutOfStock } : {}),
      },
      select: SETTINGS_SELECT,
    });
    return mapSettings(row);
  },

  // Devolve o valor gravado (o banco arredonda em 2 casas).
  async setMonthlyGoal(storeId: string, monthlyGoal: number): Promise<number> {
    const row = await prisma.store.update({
      where: { id: storeId },
      data: { monthlyGoal },
      select: { monthlyGoal: true },
    });
    // Nunca nulo depois do UPDATE; o fallback só satisfaz o tipo (a coluna é opcional).
    return row.monthlyGoal?.toNumber() ?? monthlyGoal;
  },

  // Produtos da loja com estoque <= `threshold` (esgotados inclusive), os mais críticos
  // primeiro. `count` é o total; `products` traz só os `limit` primeiros (o alerta da
  // Home mostra alguns nomes, não a lista inteira).
  async findLowStock(
    storeId: string,
    threshold: number,
    limit: number,
  ): Promise<{ count: number; products: LowStockProduct[] }> {
    const where: Prisma.StoreProductWhereInput = { storeId, stock: { lte: threshold } };

    const [count, rows] = await Promise.all([
      prisma.storeProduct.count({ where }),
      prisma.storeProduct.findMany({
        where,
        select: { id: true, stock: true, name: true, product: { select: { name: true } } },
        // Produto manual não tem `product` pra ordenar pelo nome do catálogo: cai por último dentro
        // do mesmo `stock` (ordem estável por `id`, que já é o desempate final).
        orderBy: [{ stock: 'asc' }, { id: 'asc' }],
        take: limit,
      }),
    ]);

    return {
      count,
      products: rows.map((row) => ({
        storeProductId: row.id,
        name: row.product?.name ?? row.name ?? '',
        stock: row.stock,
      })),
    };
  },

  // Total de produtos da loja (catálogo + manuais), pra checar o limite do plano antes de criar
  // mais um. Conta ativos e inativos: um produto desativado ainda ocupa uma "vaga" no estoque.
  countStoreProducts(storeId: string): Promise<number> {
    return prisma.storeProduct.count({ where: { storeId } });
  },

  countFrozenStoreProducts(storeId: string): Promise<number> {
    return prisma.storeProduct.count({ where: { storeId, frozen: true } });
  },

  // Recalcula quais produtos ficam congelados. `maxProducts: null` (sem limite) descongela tudo;
  // com limite, ficam ativos os MAIS ANTIGOS até o teto e o resto congela. Idempotente: pode rodar
  // a qualquer momento (troca de plano, produto apagado) e só mexe no que mudou.
  async reconcileFrozenProducts(storeId: string, maxProducts: number | null): Promise<void> {
    if (maxProducts === null) {
      await prisma.storeProduct.updateMany({
        where: { storeId, frozen: true },
        data: { frozen: false },
      });
      return;
    }

    const keep = await prisma.storeProduct.findMany({
      where: { storeId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: maxProducts,
      select: { id: true },
    });
    const keepIds = keep.map((row) => row.id);

    await prisma.$transaction([
      prisma.storeProduct.updateMany({
        where: { storeId, id: { in: keepIds }, frozen: true },
        data: { frozen: false },
      }),
      prisma.storeProduct.updateMany({
        where: { storeId, id: { notIn: keepIds }, frozen: false },
        data: { frozen: true },
      }),
    ]);
  },

  async findStoreProductByProductId(
    storeId: string,
    productId: number,
  ): Promise<StoreProduct | null> {
    const row = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      include: STORE_PRODUCT_INCLUDE,
    });
    return row ? mapStoreProduct(row) : null;
  },

  // Escopado por `storeId` na própria query: garante que uma loja nunca
  // enxergue (nem edite/remova) um `StoreProduct` de outra loja.
  async findStoreProductById(storeId: string, id: string): Promise<StoreProduct | null> {
    const row = await prisma.storeProduct.findFirst({
      where: { id, storeId },
      include: STORE_PRODUCT_INCLUDE,
    });
    return row ? mapStoreProduct(row) : null;
  },

  async listStoreProducts(
    storeId: string,
    filter: ListStoreProductsFilter,
  ): Promise<{ items: StoreProduct[]; total: number }> {
    // Produto de catálogo (nome vem de `Product`) e produto manual (nome próprio, ex.: uma cesta)
    // são buscados em paralelo — os dois por similaridade, não só "contém" (ver catalog.search.ts).
    const [catalogSearch, manualIds] = filter.search
      ? await Promise.all([
          buildProductSearchFilter(filter.search, storeId),
          findFuzzyStoreProductIds(storeId, filter.search),
        ])
      : [undefined, undefined];

    const where: Prisma.StoreProductWhereInput = {
      storeId,
      ...(catalogSearch ? { OR: [{ product: catalogSearch }, { id: { in: manualIds } }] } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.storeProduct.findMany({
        where,
        include: STORE_PRODUCT_INCLUDE,
        orderBy: buildOrderBy(filter.sort),
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      prisma.storeProduct.count({ where }),
    ]);

    return { items: rows.map(mapStoreProduct), total };
  },

  async createStoreProduct(data: CreateStoreProductData): Promise<StoreProduct> {
    const row = await prisma.storeProduct.create({ data, include: STORE_PRODUCT_INCLUDE });
    return mapStoreProduct(row);
  },

  async createManualStoreProduct(data: CreateManualStoreProductData): Promise<StoreProduct> {
    const row = await prisma.storeProduct.create({
      data: {
        storeId: data.storeId,
        kind: 'manual',
        name: data.name,
        description: data.description,
        image: data.image,
        price: data.price,
        costPrice: data.costPrice ?? null,
        stock: data.stock,
        minStock: data.minStock ?? 0,
        ...(data.components && data.components.length > 0
          ? { components: { create: data.components } }
          : {}),
      },
      include: STORE_PRODUCT_INCLUDE,
    });
    return mapStoreProduct(row);
  },

  // Produtos da MESMA loja (`storeId`) entre `ids`, com se cada um já é kit (tem componentes
  // próprios) — usado pra validar uma lista de componentes antes de criar/editar um kit.
  async findComponentCandidates(
    storeId: string,
    ids: string[],
  ): Promise<{ id: string; hasComponents: boolean }[]> {
    const rows = await prisma.storeProduct.findMany({
      where: { id: { in: ids }, storeId },
      select: { id: true, _count: { select: { components: true } } },
    });
    return rows.map((row) => ({ id: row.id, hasComponents: row._count.components > 0 }));
  },

  // O produto (`storeProductId`) já é componente de ALGUM kit? Usado antes de deixá-lo ganhar
  // componentes próprios (virar kit também) — ver StoreService#resolveComponents.
  async isComponentOfAnotherKit(storeProductId: string): Promise<boolean> {
    const count = await prisma.storeProductComponent.count({
      where: { componentId: storeProductId },
    });
    return count > 0;
  },

  async updateStoreProduct(id: string, data: UpdateStoreProductData): Promise<StoreProduct> {
    const { components, ...fields } = data;

    // Sem mudança nos componentes: um UPDATE só, igual antes (esse é o caminho mais comum — preço e
    // estoque mudando pelo stepper da tela Estoque).
    if (components === undefined) {
      const row = await prisma.storeProduct.update({
        where: { id },
        data: fields,
        include: STORE_PRODUCT_INCLUDE,
      });
      return mapStoreProduct(row);
    }

    const row = await prisma.$transaction(async (tx) => {
      // Substitui a lista inteira: apaga os componentes antigos e insere os novos.
      await tx.storeProductComponent.deleteMany({ where: { kitId: id } });
      if (components.length > 0) {
        await tx.storeProductComponent.createMany({
          data: components.map((component) => ({ kitId: id, ...component })),
        });
      }
      return tx.storeProduct.update({
        where: { id },
        data: fields,
        include: STORE_PRODUCT_INCLUDE,
      });
    });
    return mapStoreProduct(row);
  },

  deleteStoreProduct(id: string): Promise<unknown> {
    return prisma.storeProduct.delete({ where: { id } });
  },

  // Categorias da loja, com quantos produtos (da própria loja) estão em cada uma. Ordem alfabética:
  // é uma lista curta, criada à mão pela loja, não tem "mais recente" que faça sentido aqui.
  async listCategories(storeId: string): Promise<StoreCategory[]> {
    const rows = await prisma.storeCategory.findMany({
      where: { storeId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, productCount: row._count.products }));
  },

  // `isUniqueViolation` cobre o índice único (storeId, name): devolve `already_exists` em vez de
  // estourar, mesmo padrão de `updateStore`/`handle_taken`.
  async createCategory(
    storeId: string,
    name: string,
  ): Promise<{ kind: 'created'; category: StoreCategory } | { kind: 'already_exists' }> {
    try {
      const row = await prisma.storeCategory.create({ data: { storeId, name } });
      return { kind: 'created', category: { id: row.id, name: row.name, productCount: 0 } };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: 'already_exists' };
      throw error;
    }
  },

  // Escopado por `storeId`: devolve null se a categoria não existe ou é de outra loja (a service
  // trata isso como "não encontrada", sem revelar qual dos dois casos é).
  async findCategoryById(storeId: string, id: string): Promise<{ id: string } | null> {
    return prisma.storeCategory.findFirst({ where: { id, storeId }, select: { id: true } });
  },

  // `onDelete: SetNull` no banco já desassocia os produtos: não precisa apagar nada além da
  // categoria em si.
  deleteCategory(id: string): Promise<unknown> {
    return prisma.storeCategory.delete({ where: { id } });
  },

  // Produtos com o alerta de estoque baixo ligado (minStock > 0) — candidatos ao job
  // `notification:stock-check`. Filtra minStock > 0 no banco; a comparação estoque <= mínimo (duas
  // colunas) é feita em memória pelo próprio job, porque são poucos produtos com o alerta ligado.
  async findProductsWithMinStockConfigured(): Promise<LowStockCandidate[]> {
    const rows = await prisma.storeProduct.findMany({
      where: { minStock: { gt: 0 } },
      select: {
        id: true,
        storeId: true,
        stock: true,
        minStock: true,
        lowStockNotifiedAt: true,
        name: true,
        product: { select: { name: true } },
        store: { select: { userId: true } },
      },
    });

    return rows.map((row) => ({
      storeProductId: row.id,
      storeId: row.storeId,
      userId: row.store.userId,
      name: row.product?.name ?? row.name ?? '',
      stock: row.stock,
      minStock: row.minStock,
      lowStockNotifiedAt: row.lowStockNotifiedAt,
    }));
  },

  // Marca a notificação de estoque baixo como enviada, de forma atômica: só "ganha" quem encontrar
  // o campo ainda nulo. Devolve false se outra execução já tinha marcado (evita notificar 2x).
  async claimLowStockNotification(storeProductId: string): Promise<boolean> {
    const result = await prisma.storeProduct.updateMany({
      where: { id: storeProductId, lowStockNotifiedAt: null },
      data: { lowStockNotifiedAt: new Date() },
    });
    return result.count === 1;
  },

  // Libera um novo alerta: o estoque voltou pra cima do mínimo.
  resetLowStockNotification(storeProductId: string): Promise<unknown> {
    return prisma.storeProduct.update({
      where: { id: storeProductId },
      data: { lowStockNotifiedAt: null },
    });
  },

  // Lojas com meta mensal definida — candidatas ao job `notification:goal-check`.
  async findStoresWithMonthlyGoal(): Promise<StoreGoalCandidate[]> {
    const rows = await prisma.store.findMany({
      where: { monthlyGoal: { not: null } },
      select: { id: true, userId: true, monthlyGoal: true },
    });
    return rows.map((row) => ({
      storeId: row.id,
      userId: row.userId,
      // `monthlyGoal` não é nulo (filtrado no where); o `!` só satisfaz o tipo.
      monthlyGoal: row.monthlyGoal!.toNumber(),
    }));
  },

  // Lojas cuja última notificação promocional (ou criação, se nunca notificada) já passou de
  // `cutoff` — candidatas ao job `notification:promotion`.
  async findStoresDueForPromotion(cutoff: Date): Promise<StorePromotionCandidate[]> {
    const rows = await prisma.store.findMany({
      where: {
        OR: [
          { lastPromotionNotifiedAt: null, createdAt: { lte: cutoff } },
          { lastPromotionNotifiedAt: { lte: cutoff } },
        ],
      },
      select: { id: true, userId: true },
    });
    return rows.map((row) => ({ storeId: row.id, userId: row.userId }));
  },

  markPromotionNotified(storeId: string): Promise<unknown> {
    return prisma.store.update({
      where: { id: storeId },
      data: { lastPromotionNotifiedAt: new Date() },
    });
  },
};

export type StoreRepository = typeof storeRepository;
