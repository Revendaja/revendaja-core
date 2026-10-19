import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { buildProductSearchFilter, findFuzzyStoreProductIds } from '../catalog/catalog.search';
import type { StorefrontCategory, StorefrontProduct } from './storefront.types';

interface ListProductsFilter {
  // Loja configurada para esconder o produto com estoque zerado.
  hideOutOfStock: boolean;
  search?: string;
  // Só os produtos dessa categoria própria da loja / dessa marca (atalhos da vitrine).
  categoryId?: string;
  brandId?: number;
  page: number;
  pageSize: number;
}

// Produto cadastrado há menos que isso ganha o selo "Novo".
const NEW_PRODUCT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// Janela das vendas que decidem os "mais vendidos".
const BEST_SELLERS_DAYS = 90;
// Teto de produtos lidos para montar os atalhos de categoria (uma loja grande não pesa a vitrine).
const CATEGORY_SCAN_LIMIT = 3000;

const PRODUCT_SELECT = {
  id: true,
  price: true,
  promoPrice: true,
  promoEndsAt: true,
  stock: true,
  name: true,
  description: true,
  image: true,
  createdAt: true,
  product: {
    select: {
      name: true,
      description: true,
      productImage: true,
      productImageSm: true,
      brand: { select: { name: true } },
    },
  },
} satisfies Prisma.StoreProductSelect;

type ProductRow = Prisma.StoreProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

// Um produto do catálogo usa os campos do `Product` (mesmo quando são null de verdade, ex.: sem
// descrição); um produto manual usa os campos próprios do StoreProduct. Decide pela PRESENÇA de
// `product` uma vez só — nada de `??` campo a campo, que trocaria um null real do catálogo pelo
// campo manual (sempre vazio nesse caso) por engano.
function mapProduct(row: ProductRow, now: Date): StorefrontProduct {
  const catalog = row.product;
  // Mesmo cálculo de `store.repository#mapStoreProduct`: "ainda vale?" na hora da leitura.
  const isPromoActive =
    row.promoPrice !== null && row.promoEndsAt !== null && row.promoEndsAt > now;
  return {
    id: row.id,
    name: catalog ? catalog.name : (row.name ?? ''),
    description: catalog ? catalog.description : row.description,
    brand: catalog ? catalog.brand.name : 'Produto Próprio',
    image: catalog ? catalog.productImage : row.image,
    imageSm: catalog ? catalog.productImageSm : row.image,
    price: row.price.toNumber(),
    promoPrice: isPromoActive ? (row.promoPrice?.toNumber() ?? null) : null,
    isPromoActive,
    inStock: row.stock > 0,
    isNew: now.getTime() - row.createdAt.getTime() < NEW_PRODUCT_DAYS * DAY_MS,
  };
}

// O que o cliente pode ver: produto VISÍVEL na vitrine (`isActive`), não congelado (acima do limite
// do plano) e, se a loja pediu, com estoque. Escopado por `storeId` na própria query.
function visibleWhere(storeId: string, hideOutOfStock: boolean): Prisma.StoreProductWhereInput {
  return {
    storeId,
    isActive: true,
    frozen: false,
    ...(hideOutOfStock ? { stock: { gt: 0 } } : {}),
  };
}

export const storefrontRepository = {
  // Guarda só o momento da visita (sem dado do visitante).
  async recordVisit(storeId: string): Promise<void> {
    await prisma.storeVisit.create({ data: { storeId } });
  },

  // Apaga as visitas anteriores a `cutoff` (de todas as lojas). Devolve quantas foram apagadas.
  async deleteVisitsBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.storeVisit.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
  },

  countVisitsSince(storeId: string, since: Date): Promise<number> {
    return prisma.storeVisit.count({ where: { storeId, createdAt: { gte: since } } });
  },

  async listProducts(
    storeId: string,
    filter: ListProductsFilter,
  ): Promise<{ items: StorefrontProduct[]; total: number }> {
    // Produto de catálogo (nome vem de `Product`) e produto manual (nome próprio, ex.: uma cesta)
    // são buscados em paralelo — os dois por similaridade, não só "contém" (ver catalog.search.ts).
    const [catalogSearch, manualIds] = filter.search
      ? await Promise.all([
          buildProductSearchFilter(filter.search, storeId),
          findFuzzyStoreProductIds(storeId, filter.search),
        ])
      : [undefined, undefined];

    const where: Prisma.StoreProductWhereInput = {
      ...visibleWhere(storeId, filter.hideOutOfStock),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.brandId ? { product: { brandId: filter.brandId } } : {}),
      // Um produto manual não tem `product` (relação com o catálogo): busca também pelo nome
      // próprio dele, senão ele nunca apareceria numa busca na vitrine.
      ...(catalogSearch ? { OR: [{ product: catalogSearch }, { id: { in: manualIds } }] } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.storeProduct.findMany({
        where,
        select: PRODUCT_SELECT,
        orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      prisma.storeProduct.count({ where }),
    ]);

    const now = new Date();
    return { items: rows.map((row) => mapProduct(row, now)), total };
  },

  // Atalhos de categoria: as categorias próprias da loja e as marcas dos produtos, só as que têm
  // produto visível, da maior para a menor.
  async listCategories(storeId: string, hideOutOfStock: boolean): Promise<StorefrontCategory[]> {
    const rows = await prisma.storeProduct.findMany({
      where: visibleWhere(storeId, hideOutOfStock),
      select: {
        image: true,
        category: { select: { id: true, name: true } },
        product: {
          select: {
            productImage: true,
            productImageSm: true,
            brand: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: CATEGORY_SCAN_LIMIT,
    });

    const groups = new Map<string, StorefrontCategory>();
    const add = (
      type: StorefrontCategory['type'],
      id: string,
      name: string,
      image: string | null,
    ) => {
      const key = `${type}:${id}`;
      const group = groups.get(key);
      if (group) {
        group.count += 1;
        group.image ??= image;
      } else {
        groups.set(key, { type, id, name, count: 1, image });
      }
    };

    for (const row of rows) {
      const catalog = row.product;
      const image = catalog ? (catalog.productImageSm ?? catalog.productImage) : row.image;
      if (row.category) add('category', row.category.id, row.category.name, image);
      if (catalog) add('brand', String(catalog.brand.id), catalog.brand.name, image);
    }

    return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  },

  // Mais vendidos (últimos 90 dias, pedido não cancelado). Só devolve o que ainda está visível.
  async listBestSellers(
    storeId: string,
    hideOutOfStock: boolean,
    limit: number,
    now: Date,
  ): Promise<StorefrontProduct[]> {
    const since = new Date(now.getTime() - BEST_SELLERS_DAYS * DAY_MS);
    const sold = await prisma.saleItem.groupBy({
      by: ['storeProductId'],
      where: {
        storeProductId: { not: null },
        sale: { storeId, status: { not: 'cancelled' }, createdAt: { gte: since } },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      // Folga: parte dos mais vendidos pode estar oculta, congelada ou esgotada.
      take: limit * 3,
    });
    const ids = sold.map((row) => row.storeProductId).filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const rows = await prisma.storeProduct.findMany({
      where: { ...visibleWhere(storeId, hideOutOfStock), id: { in: ids } },
      select: PRODUCT_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is ProductRow => row !== undefined)
      .slice(0, limit)
      .map((row) => mapProduct(row, now));
  },

  // Em promoção e ainda valendo, a que acaba primeiro vem antes.
  async listOffers(
    storeId: string,
    hideOutOfStock: boolean,
    limit: number,
    now: Date,
  ): Promise<{ products: StorefrontProduct[]; endsAt: Date | null }> {
    const rows = await prisma.storeProduct.findMany({
      where: {
        ...visibleWhere(storeId, hideOutOfStock),
        promoPrice: { not: null },
        promoEndsAt: { gt: now },
      },
      select: PRODUCT_SELECT,
      orderBy: [{ promoEndsAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return {
      products: rows.map((row) => mapProduct(row, now)),
      endsAt: rows[0]?.promoEndsAt ?? null,
    };
  },

  // Cadastrados mais recentemente. `excludeIds` evita repetir o que já está nos destaques.
  async listNewest(
    storeId: string,
    hideOutOfStock: boolean,
    limit: number,
    now: Date,
    excludeIds: string[] = [],
  ): Promise<StorefrontProduct[]> {
    const rows = await prisma.storeProduct.findMany({
      where: {
        ...visibleWhere(storeId, hideOutOfStock),
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      select: PRODUCT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => mapProduct(row, now));
  },

  // --- Personalização (banners e textos) ---------------------------------------------------------

  async getConfigOverrides(storeId: string): Promise<unknown> {
    const row = await prisma.store.findUnique({
      where: { id: storeId },
      select: { storefrontConfig: true },
    });
    return row?.storefrontConfig ?? null;
  },

  async setConfigOverrides(storeId: string, overrides: Prisma.InputJsonObject): Promise<void> {
    await prisma.store.update({ where: { id: storeId }, data: { storefrontConfig: overrides } });
  },
};

export type StorefrontRepository = typeof storefrontRepository;
