import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { buildProductSearchFilter, findFuzzyStoreProductIds } from '../catalog/catalog.search';

// Consultas de LEITURA feitas só para o assistente (listas enxutas, sem o peso do StoreProduct
// completo). Toda consulta recebe `storeId` e filtra por ele: é o isolamento entre consultoras.

const MANUAL_BRAND_NAME = 'Produto Próprio';

export type StockStatusFilter = 'all' | 'out' | 'low' | 'in';

export interface StockRow {
  storeProductId: string;
  name: string;
  brand: string;
  image: string | null;
  stock: number;
  minStock: number;
  price: number;
  // Preço que a venda cobraria agora: o promocional enquanto a promoção vale, senão o normal.
  effectivePrice: number;
  costPrice: number | null;
}

export interface StockValue {
  // Quanto a loja pagou pelo estoque que tem (só conta produto com custo informado).
  invested: number;
  // Quanto entraria vendendo todo o estoque pelo preço atual.
  potentialRevenue: number;
  units: number;
  productsInStock: number;
  // Produtos em estoque sem custo informado: ficam de fora de `invested`.
  productsWithoutCost: number;
}

type StockRowSource = Prisma.StoreProductGetPayload<{
  include: { product: { include: { brand: true } } };
}>;

function toStockRow(row: StockRowSource): StockRow {
  return {
    storeProductId: row.id,
    name: row.name ?? row.product?.name ?? 'Produto',
    brand: row.product?.brand.name ?? MANUAL_BRAND_NAME,
    image: row.image ?? row.product?.productImageSm ?? null,
    stock: row.stock,
    minStock: row.minStock,
    price: Number(row.price),
    effectivePrice:
      row.promoPrice !== null && row.promoEndsAt !== null && row.promoEndsAt > new Date()
        ? Number(row.promoPrice)
        : Number(row.price),
    costPrice: row.costPrice === null ? null : Number(row.costPrice),
  };
}

export type CustomerSort = 'spent' | 'recent' | 'inactive' | 'pending';

export interface CustomerSummary {
  name: string;
  purchases: number;
  totalSpent: number;
  pendingAmount: number;
  lastPurchaseAt: Date | null;
}

export interface CustomerSale {
  number: number;
  createdAt: Date;
  status: string;
  paymentMethod: string;
  total: number;
  items: { name: string; quantity: number }[];
}

export const aiQueries = {
  async searchStock(
    storeId: string,
    filter: { search?: string; brand?: string; status: StockStatusFilter; limit: number },
  ): Promise<{ items: StockRow[]; total: number }> {
    // Mesma busca por similaridade da tela Estoque (catálogo e produto manual).
    const [catalogSearch, manualIds] = filter.search
      ? await Promise.all([
          buildProductSearchFilter(filter.search, storeId),
          findFuzzyStoreProductIds(storeId, filter.search),
        ])
      : [undefined, undefined];

    const where: Prisma.StoreProductWhereInput = {
      storeId,
      ...(catalogSearch ? { OR: [{ product: catalogSearch }, { id: { in: manualIds } }] } : {}),
      ...(filter.brand
        ? { product: { brand: { name: { contains: filter.brand, mode: 'insensitive' } } } }
        : {}),
      ...(filter.status === 'out' ? { stock: 0 } : {}),
      ...(filter.status === 'in' ? { stock: { gt: 0 } } : {}),
      // Estoque baixo: ainda tem, mas no mínimo configurado ou abaixo (mínimo 0 = alerta desligado).
      ...(filter.status === 'low'
        ? { minStock: { gt: 0 }, stock: { gt: 0, lte: prisma.storeProduct.fields.minStock } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.storeProduct.findMany({
        where,
        include: { product: { include: { brand: true } } },
        orderBy: [{ stock: 'asc' }, { createdAt: 'desc' }],
        take: filter.limit,
      }),
      prisma.storeProduct.count({ where }),
    ]);

    return { items: rows.map(toStockRow), total };
  },

  // Quais destes produtos do catálogo a loja já tem (productId do catálogo -> id do produto da loja).
  async storeProductIdsByCatalogId(
    storeId: string,
    productIds: number[],
  ): Promise<Map<number, string>> {
    if (productIds.length === 0) return new Map();
    const rows = await prisma.storeProduct.findMany({
      where: { storeId, productId: { in: productIds } },
      select: { id: true, productId: true },
    });
    const map = new Map<number, string>();
    for (const row of rows) {
      if (row.productId !== null) map.set(row.productId, row.id);
    }
    return map;
  },

  async findStockRow(storeId: string, storeProductId: string): Promise<StockRow | null> {
    const row = await prisma.storeProduct.findFirst({
      where: { id: storeProductId, storeId },
      include: { product: { include: { brand: true } } },
    });
    return row ? toStockRow(row) : null;
  },

  // Os totais saem de uma soma no banco (não de uma lista enviada ao modelo).
  async stockValue(storeId: string): Promise<StockValue> {
    const [row] = await prisma.$queryRaw<
      {
        invested: Prisma.Decimal | number | string;
        potential: Prisma.Decimal | number | string;
        units: bigint | number;
        in_stock: bigint | number;
        without_cost: bigint | number;
      }[]
    >`
      SELECT
        COALESCE(SUM(stock * cost_price) FILTER (WHERE stock > 0), 0) AS invested,
        COALESCE(SUM(stock * price) FILTER (WHERE stock > 0), 0) AS potential,
        COALESCE(SUM(stock) FILTER (WHERE stock > 0), 0) AS units,
        COUNT(*) FILTER (WHERE stock > 0) AS in_stock,
        COUNT(*) FILTER (WHERE stock > 0 AND cost_price IS NULL) AS without_cost
      FROM store_products
      WHERE store_id = ${storeId}
    `;
    return {
      invested: Number(row.invested),
      potentialRevenue: Number(row.potential),
      units: Number(row.units),
      productsInStock: Number(row.in_stock),
      productsWithoutCost: Number(row.without_cost),
    };
  },

  async findSaleIdByNumber(storeId: string, number: number): Promise<string | null> {
    const sale = await prisma.sale.findFirst({ where: { storeId, number }, select: { id: true } });
    return sale?.id ?? null;
  },

  // O app não tem cadastro de clientes: a "cliente" é o nome digitado na venda (maiúsculas e espaços
  // sobrando não separam duas clientes). Vendas canceladas não contam.
  async customerSummaries(
    storeId: string,
    filter: {
      search?: string;
      sort: CustomerSort;
      inactiveSince?: Date;
      onlyWithPending: boolean;
      limit: number;
    },
  ): Promise<CustomerSummary[]> {
    const search = filter.search
      ? Prisma.sql`AND customer_name ILIKE ${`%${filter.search}%`}`
      : Prisma.empty;
    const having = Prisma.join(
      [
        Prisma.sql`COUNT(*) FILTER (WHERE status <> 'cancelled') > 0`,
        ...(filter.inactiveSince
          ? [
              Prisma.sql`MAX(created_at) FILTER (WHERE status <> 'cancelled') < ${filter.inactiveSince}`,
            ]
          : []),
        ...(filter.onlyWithPending
          ? [Prisma.sql`COALESCE(SUM(total) FILTER (WHERE status = 'pending'), 0) > 0`]
          : []),
      ],
      ' AND ',
    );
    const orderBy = {
      spent: Prisma.sql`total_spent DESC`,
      recent: Prisma.sql`last_purchase_at DESC NULLS LAST`,
      inactive: Prisma.sql`last_purchase_at ASC NULLS LAST`,
      pending: Prisma.sql`pending_amount DESC`,
    }[filter.sort];

    const rows = await prisma.$queryRaw<
      {
        name: string;
        purchases: bigint | number;
        total_spent: Prisma.Decimal | number | string;
        pending_amount: Prisma.Decimal | number | string;
        last_purchase_at: Date | null;
      }[]
    >`
      SELECT
        MIN(TRIM(customer_name)) AS name,
        COUNT(*) FILTER (WHERE status <> 'cancelled') AS purchases,
        COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) AS total_spent,
        COALESCE(SUM(total) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
        MAX(created_at) FILTER (WHERE status <> 'cancelled') AS last_purchase_at
      FROM sales
      WHERE store_id = ${storeId} ${search}
      GROUP BY LOWER(TRIM(customer_name))
      HAVING ${having}
      ORDER BY ${orderBy}
      LIMIT ${filter.limit}
    `;

    return rows.map((row) => ({
      name: row.name,
      purchases: Number(row.purchases),
      totalSpent: Number(row.total_spent),
      pendingAmount: Number(row.pending_amount),
      lastPurchaseAt: row.last_purchase_at,
    }));
  },

  async customerSales(storeId: string, name: string, limit: number): Promise<CustomerSale[]> {
    const rows = await prisma.sale.findMany({
      where: { storeId, customerName: { equals: name.trim(), mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: { select: { productName: true, quantity: true } } },
    });
    return rows.map((row) => ({
      number: row.number,
      createdAt: row.createdAt,
      status: row.status,
      paymentMethod: row.paymentMethod,
      total: Number(row.total),
      items: row.items.map((item) => ({ name: item.productName, quantity: item.quantity })),
    }));
  },
};
