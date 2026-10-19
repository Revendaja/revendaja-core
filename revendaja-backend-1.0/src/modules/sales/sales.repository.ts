import type { Prisma } from '@prisma/client';
import { isUniqueViolation } from '../../database/errors';
import { prisma } from '../../database/prisma';
import { fromCents, toCents } from './sales.money';
import type {
  CancelSaleResult,
  CreateSaleData,
  CreateSaleResult,
  FulfillmentMethod,
  PaymentMethod,
  PeriodTotals,
  Sale,
  SaleListItem,
  SaleSource,
  SaleStatus,
  StaleProduct,
  SummaryData,
  TimelineSaleRow,
  TopBrand,
  TopProduct,
} from './sales.types';

// Teto do total da venda: DECIMAL(12,2) no banco (até 9.999.999.999,99).
const MAX_TOTAL_CENTS = 999_999_999_999;

// Ordem estável dos itens no detalhe (a tabela não guarda a posição no carrinho).
const SALE_INCLUDE = {
  items: { orderBy: [{ productName: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.SaleInclude;

type SaleWithItems = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;
type SaleRow = Prisma.SaleGetPayload<Record<string, never>>;

function mapListItem(row: SaleRow): SaleListItem {
  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt,
    status: row.status as SaleStatus,
    source: row.source as SaleSource,
    paymentMethod: row.paymentMethod as PaymentMethod,
    installments: row.installments,
    total: row.total.toNumber(),
    customerName: row.customerName,
    customerWhatsapp: row.customerWhatsapp,
    fulfillment: row.fulfillment as FulfillmentMethod | null,
  };
}

// Não devolve custo (`unitCost`) de propósito: o detalhe mostra só o total.
function mapSale(row: SaleWithItems): Sale {
  return {
    ...mapListItem(row),
    items: row.items.map((item) => {
      const unitPrice = item.unitPrice.toNumber();
      return {
        storeProductId: item.storeProductId,
        productName: item.productName,
        productImageSm: item.productImageSm,
        quantity: item.quantity,
        unitPrice,
        subtotal: fromCents(toCents(unitPrice) * item.quantity),
      };
    }),
    deliveryAddress: row.deliveryAddress,
    cashChangeFor: row.cashChangeFor === null ? null : row.cashChangeFor.toNumber(),
  };
}

// Abandona a transação (ROLLBACK) com um resultado "de negócio". Lançar de dentro
// do callback é o jeito de o Prisma desfazer tudo — inclusive o número já
// consumido e o estoque já baixado.
class SaleAbort extends Error {
  constructor(readonly result: Exclude<CreateSaleResult, { kind: 'created' | 'duplicate' }>) {
    super(result.kind);
  }
}

interface ListSalesFilter {
  from?: Date;
  to?: Date;
  status?: SaleStatus;
  source?: SaleSource;
  page: number;
  pageSize: number;
}

function periodWhere(from?: Date, to?: Date): Prisma.SaleWhereInput {
  if (!from && !to) return {};
  return { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } };
}

// Escopado por `storeId` na própria query: uma loja nunca enxerga venda de outra.
async function findSaleById(storeId: string, id: string): Promise<Sale | null> {
  const row = await prisma.sale.findFirst({ where: { id, storeId }, include: SALE_INCLUDE });
  return row ? mapSale(row) : null;
}

async function findSaleByClientRequestId(
  storeId: string,
  clientRequestId: string,
): Promise<Sale | null> {
  const row = await prisma.sale.findUnique({
    where: { storeId_clientRequestId: { storeId, clientRequestId } },
    include: SALE_INCLUDE,
  });
  return row ? mapSale(row) : null;
}

// Total das vendas do período por status, em centavos. `from` inclusivo, `to` exclusivo. Com `source`,
// só as vendas dessa origem.
async function periodTotals(
  storeId: string,
  from: Date,
  to: Date,
  source?: SaleSource,
): Promise<PeriodTotals> {
  const totals = await prisma.sale.groupBy({
    by: ['status'],
    where: { storeId, createdAt: { gte: from, lt: to }, ...(source ? { source } : {}) },
    _sum: { total: true },
  });

  const sumOf = (status: SaleStatus) =>
    toCents(totals.find((row) => row.status === status)?._sum.total?.toNumber() ?? 0);

  return { paidCents: sumOf('paid'), pendingCents: sumOf('pending') };
}

export const salesRepository = {
  findById: findSaleById,
  findByClientRequestId: findSaleByClientRequestId,

  async list(
    storeId: string,
    filter: ListSalesFilter,
  ): Promise<{ items: SaleListItem[]; total: number }> {
    const where: Prisma.SaleWhereInput = {
      storeId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...periodWhere(filter.from, filter.to),
    };

    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      prisma.sale.count({ where }),
    ]);

    return { items: rows.map(mapListItem), total };
  },

  // Cria a venda, baixa o estoque e numera — TUDO numa transação, ou nada:
  //  1. O UPDATE do contador trava a linha da loja: vendas simultâneas da mesma
  //     loja são serializadas e nunca repetem o número.
  //  2. O preço e o custo gravados nos itens são os vigentes NESTA transação.
  //  3. A baixa de estoque é um UPDATE condicional (`stock >= quantidade`): o
  //     próprio banco recusa vender além do estoque, mesmo com vendas paralelas.
  //  4. Repetir o `clientRequestId` devolve a venda existente (idempotência),
  //     inclusive se duas chamadas iguais chegarem ao mesmo tempo (índice único).
  async createSale(data: CreateSaleData): Promise<CreateSaleResult> {
    const existing = await findSaleByClientRequestId(data.storeId, data.clientRequestId);
    if (existing) return { kind: 'duplicate', sale: existing };

    try {
      const row = await prisma.$transaction(
        async (tx) => {
          const { saleCounter } = await tx.store.update({
            where: { id: data.storeId },
            data: { saleCounter: { increment: 1 } },
            select: { saleCounter: true },
          });

          const products = await tx.storeProduct.findMany({
            where: {
              id: { in: data.items.map((i) => i.storeProductId) },
              storeId: data.storeId,
              // Pedido online só vende o que está visível na vitrine (ativo e não congelado).
              ...(data.onlyActiveProducts ? { isActive: true, frozen: false } : {}),
            },
            include: {
              product: { select: { name: true, productImageSm: true } },
              // Se o produto vendido é um kit (ex.: uma cesta), cada componente também é debitado.
              components: {
                include: {
                  component: {
                    select: { id: true, name: true, product: { select: { name: true } } },
                  },
                },
              },
            },
          });
          const byId = new Map(products.map((p) => [p.id, p]));

          const now = new Date();
          let totalCents = 0;
          const lines = data.items.map((item) => {
            const storeProduct = byId.get(item.storeProductId);
            if (!storeProduct) throw new SaleAbort({ kind: 'product_not_found' });
            // Cobra o preço promocional quando ainda vale — mesmo cálculo de `mapStoreProduct`
            // (store.repository.ts): "ainda vale?" é decidido aqui, na hora da venda.
            const unitPrice =
              storeProduct.promoPrice !== null &&
              storeProduct.promoEndsAt !== null &&
              storeProduct.promoEndsAt > now
                ? storeProduct.promoPrice
                : storeProduct.price;
            const unitPriceCents = toCents(unitPrice.toNumber());
            totalCents += unitPriceCents * item.quantity;
            return { item, storeProduct, unitPrice };
          });
          if (totalCents > MAX_TOTAL_CENTS) throw new SaleAbort({ kind: 'total_too_large' });
          // Troco para menos que o total não faz sentido. O total só é conhecido aqui (o preço vem
          // do banco, nunca do cliente).
          if (data.cashChangeFor !== null && toCents(data.cashChangeFor) < totalCents) {
            throw new SaleAbort({ kind: 'change_too_low', total: fromCents(totalCents) });
          }

          // Um único mapa "storeProductId -> quantidade a debitar", somando a quantidade vendida
          // direta com a de cada componente de kit vendido: o mesmo produto pode aparecer como item
          // direto E como componente de outro item na mesma venda, e precisa de UM só decremento.
          const decrements = new Map<string, { quantity: number; name: string }>();
          const addDecrement = (id: string, quantity: number, name: string) => {
            const current = decrements.get(id);
            decrements.set(id, { quantity: (current?.quantity ?? 0) + quantity, name });
          };
          for (const { item, storeProduct } of lines) {
            addDecrement(
              storeProduct.id,
              item.quantity,
              storeProduct.product?.name ?? storeProduct.name ?? '',
            );
            for (const { component, quantity } of storeProduct.components) {
              addDecrement(
                component.id,
                quantity * item.quantity,
                component.product?.name ?? component.name ?? '',
              );
            }
          }

          // Sempre na mesma ordem (por id): duas vendas concorrentes com os mesmos
          // produtos em ordens diferentes poderiam, senão, travar uma à outra.
          const orderedDecrements = [...decrements.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
          for (const [storeProductId, { quantity, name }] of orderedDecrements) {
            const { count } = await tx.storeProduct.updateMany({
              where: {
                id: storeProductId,
                storeId: data.storeId,
                stock: { gte: quantity },
              },
              data: { stock: { decrement: quantity } },
            });
            if (count === 0) {
              const current = await tx.storeProduct.findUnique({
                where: { id: storeProductId },
                select: { stock: true },
              });
              throw new SaleAbort({
                kind: 'insufficient_stock',
                productName: name,
                available: current?.stock ?? 0,
              });
            }
          }

          return tx.sale.create({
            data: {
              storeId: data.storeId,
              number: saleCounter,
              clientRequestId: data.clientRequestId,
              customerName: data.customerName,
              customerWhatsapp: data.customerWhatsapp,
              fulfillment: data.fulfillment,
              deliveryAddress: data.deliveryAddress,
              cashChangeFor: data.cashChangeFor,
              paymentMethod: data.paymentMethod,
              installments: data.installments,
              status: data.status,
              source: data.source,
              total: fromCents(totalCents),
              items: {
                create: lines.map(({ item, storeProduct, unitPrice }) => ({
                  storeProductId: item.storeProductId,
                  productName: storeProduct.product?.name ?? storeProduct.name ?? '',
                  productImageSm: storeProduct.product?.productImageSm ?? storeProduct.image,
                  quantity: item.quantity,
                  unitPrice,
                  unitCost: storeProduct.costPrice,
                  // Cópia dos componentes debitados por causa deste item: cancelar a venda depois
                  // devolve exatamente isso, mesmo que a composição do kit mude nesse meio tempo.
                  ...(storeProduct.components.length > 0
                    ? {
                        components: {
                          create: storeProduct.components.map(({ component, quantity }) => ({
                            componentStoreProductId: component.id,
                            componentName: component.product?.name ?? component.name ?? '',
                            quantity: quantity * item.quantity,
                          })),
                        },
                      }
                    : {}),
                })),
              },
            },
            include: SALE_INCLUDE,
          });
        },
        // Cada consulta é uma ida ao banco (remoto): vendas com muitos itens
        // passam do timeout padrão de 5 s.
        { maxWait: 10_000, timeout: 30_000 },
      );

      return { kind: 'created', sale: mapSale(row) };
    } catch (error) {
      if (error instanceof SaleAbort) return error.result;

      // Duas chamadas com o mesmo clientRequestId ao mesmo tempo: a segunda cai
      // no índice único (e a transação dela é desfeita). Devolve a venda da primeira.
      if (isUniqueViolation(error)) {
        const winner = await findSaleByClientRequestId(data.storeId, data.clientRequestId);
        if (winner) return { kind: 'duplicate', sale: winner };
      }
      throw error;
    }
  },

  // Pedidos feitos na vitrine (`online`) que continuam PENDENTES e foram criados antes de `cutoff`, de
  // todas as lojas, do mais antigo para o mais novo (até `limit`). Só os `online`: uma venda pendente
  // registrada pela própria loja não reserva estoque de cliente.
  findExpiredOnlineOrders(cutoff: Date, limit: number): Promise<{ id: string; storeId: string }[]> {
    return prisma.sale.findMany({
      where: { source: 'online', status: 'pending', createdAt: { lt: cutoff } },
      select: { id: true, storeId: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  },

  // Cancela um pedido PENDENTE e devolve o estoque que ele reservou, TUDO numa transação:
  //  1. O UPDATE só casa `pending`: cancelar duas vezes (ou duas chamadas ao mesmo tempo) devolve o
  //     estoque UMA vez só, e uma venda paga nunca é cancelada.
  //  2. Item cujo produto saiu da loja (`storeProductId` nulo) não tem estoque para devolver.
  //  3. Os produtos são atualizados sempre na mesma ordem (por id), como na criação da venda.
  async cancel(storeId: string, id: string): Promise<CancelSaleResult> {
    return prisma.$transaction(
      async (tx): Promise<CancelSaleResult> => {
        const { count } = await tx.sale.updateMany({
          where: { id, storeId, status: 'pending' },
          data: { status: 'cancelled' },
        });

        if (count === 1) {
          const items = await tx.saleItem.findMany({
            where: { saleId: id },
            select: {
              storeProductId: true,
              quantity: true,
              // Componentes de kit debitados por este item (cópia da hora da venda — ver `createSale`).
              components: { select: { componentStoreProductId: true, quantity: true } },
            },
          });

          // Um único mapa por produto: o item vendido direto e os componentes de kit somam na
          // mesma restauração (mesmo raciocínio do decremento em `createSale`). Item cujo produto
          // saiu da loja (`storeProductId` nulo) não tem estoque próprio pra devolver, mas os
          // componentes dele (cada um com FK independente) continuam restaurados normalmente.
          const restores = new Map<string, number>();
          const addRestore = (storeProductId: string | null, quantity: number) => {
            if (storeProductId === null) return;
            restores.set(storeProductId, (restores.get(storeProductId) ?? 0) + quantity);
          };
          for (const item of items) {
            addRestore(item.storeProductId, item.quantity);
            for (const component of item.components) {
              addRestore(component.componentStoreProductId, component.quantity);
            }
          }

          // Sempre na mesma ordem (por id), como na criação da venda.
          const ordered = [...restores.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
          for (const [storeProductId, quantity] of ordered) {
            await tx.storeProduct.updateMany({
              where: { id: storeProductId, storeId },
              data: { stock: { increment: quantity } },
            });
          }
        }

        const row = await tx.sale.findFirst({ where: { id, storeId }, include: SALE_INCLUDE });
        if (!row) return { kind: 'not_found' };

        const sale = mapSale(row);
        if (count === 1) return { kind: 'cancelled', sale };
        return row.status === 'cancelled'
          ? { kind: 'already_cancelled', sale }
          : { kind: 'paid', sale };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  },

  // Só pendente -> paga; em venda já paga o UPDATE simplesmente não casa nenhuma
  // linha (idempotente). Devolve null se a venda não existe nesta loja.
  async markPaid(storeId: string, id: string): Promise<Sale | null> {
    await prisma.sale.updateMany({
      where: { id, storeId, status: 'pending' },
      data: { status: 'paid' },
    });
    return findSaleById(storeId, id);
  },

  periodTotals,

  // Quantas vendas da loja vieram de `source` (ex.: pedidos feitos pelo cliente na vitrine), em qualquer
  // período. Pedido cancelado não conta: o número mostra os pedidos que valem.
  countBySource(storeId: string, source: SaleSource): Promise<number> {
    return prisma.sale.count({ where: { storeId, source, status: { not: 'cancelled' } } });
  },

  // Quantas vendas da loja estão pendentes (fiado a receber), de QUALQUER período:
  // uma venda pendente antiga continua sendo dinheiro a receber.
  countPending(storeId: string): Promise<number> {
    return prisma.sale.count({ where: { storeId, status: 'pending' } });
  },

  // Dados crus do período; as contas ficam em `buildSalesSummary`. `from` inclusivo, `to` exclusivo.
  async summaryData(
    storeId: string,
    from: Date,
    to: Date,
    source?: SaleSource,
  ): Promise<SummaryData> {
    const createdAt = { gte: from, lt: to };

    const [totals, paidItems] = await Promise.all([
      periodTotals(storeId, from, to, source),
      prisma.saleItem.findMany({
        where: { sale: { storeId, status: 'paid', createdAt, ...(source ? { source } : {}) } },
        select: { unitPrice: true, unitCost: true, quantity: true },
      }),
    ]);

    return {
      ...totals,
      paidItems: paidItems.map((item) => ({
        unitPriceCents: toCents(item.unitPrice.toNumber()),
        unitCostCents: item.unitCost === null ? null : toCents(item.unitCost.toNumber()),
        quantity: item.quantity,
      })),
    };
  },

  // Vendas PAGAS do período com o custo dos itens, para o gráfico de evolução. Agrega em memória pelo
  // mesmo motivo de `summaryData`/`topProducts` (custo = unitCost * quantity linha a linha). `from`
  // inclusivo, `to` exclusivo.
  async timelineSales(storeId: string, from: Date, to: Date): Promise<TimelineSaleRow[]> {
    const rows = await prisma.sale.findMany({
      where: { storeId, status: 'paid', createdAt: { gte: from, lt: to } },
      select: {
        createdAt: true,
        total: true,
        items: { select: { unitCost: true, quantity: true } },
      },
    });

    return rows.map((row) => {
      let costCents = 0;
      let hasUncostedItem = false;
      for (const item of row.items) {
        if (item.unitCost === null) {
          hasUncostedItem = true;
          continue;
        }
        costCents += toCents(item.unitCost.toNumber()) * item.quantity;
      }
      return {
        createdAt: row.createdAt,
        totalCents: toCents(row.total.toNumber()),
        costCents,
        hasUncostedItem,
      };
    });
  },

  // Ranking por quantidade vendida (vendas pagas do período). Agrega em memória em vez de `groupBy`
  // porque a receita soma `unitPrice * quantity` linha a linha (o SQL `groupBy` do Prisma não expressa
  // essa multiplicação) — mesmo raciocínio de `summaryData`, que já agrega `paidItems` fora do banco.
  // Item cujo produto saiu da loja (`storeProductId` nulo) fica de fora: o relatório é "dos produtos
  // que ainda vendo", não um histórico geral.
  async topProducts(storeId: string, from: Date, to: Date, limit: number): Promise<TopProduct[]> {
    const rows = await prisma.saleItem.findMany({
      where: {
        sale: { storeId, status: 'paid', createdAt: { gte: from, lt: to } },
        storeProductId: { not: null },
      },
      select: { storeProductId: true, quantity: true, unitPrice: true },
    });

    const totals = new Map<string, { quantity: number; revenueCents: number }>();
    for (const row of rows) {
      const id = row.storeProductId as string;
      const current = totals.get(id) ?? { quantity: 0, revenueCents: 0 };
      current.quantity += row.quantity;
      current.revenueCents += toCents(row.unitPrice.toNumber()) * row.quantity;
      totals.set(id, current);
    }

    const ranked = [...totals.entries()]
      .sort(([, a], [, b]) => b.quantity - a.quantity)
      .slice(0, limit);
    if (ranked.length === 0) return [];

    // Nome/imagem ATUAIS do produto (não os de quando foi vendido): o relatório mostra o que a loja
    // tem hoje, não um retrato congelado.
    const products = await prisma.storeProduct.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      select: {
        id: true,
        name: true,
        image: true,
        product: { select: { name: true, productImageSm: true } },
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    return ranked.map(([storeProductId, totalsForProduct]) => {
      const product = productById.get(storeProductId);
      return {
        storeProductId,
        name: product?.product?.name ?? product?.name ?? '',
        image: product?.product?.productImageSm ?? product?.image ?? null,
        quantitySold: totalsForProduct.quantity,
        revenue: fromCents(totalsForProduct.revenueCents),
      };
    });
  },

  // Ranking de marcas por quantidade vendida (vendas pagas do período). A marca vem do produto do
  // catálogo; produto manual (sem marca) e item cujo produto saiu da loja ficam de fora. Agrega em
  // memória pelo mesmo motivo de `topProducts` (receita = unitPrice * quantity linha a linha).
  async topBrands(storeId: string, from: Date, to: Date, limit: number): Promise<TopBrand[]> {
    const rows = await prisma.saleItem.findMany({
      where: {
        sale: { storeId, status: 'paid', createdAt: { gte: from, lt: to } },
        storeProductId: { not: null },
      },
      select: {
        quantity: true,
        unitPrice: true,
        storeProduct: {
          select: {
            product: { select: { brand: { select: { id: true, name: true, logo: true } } } },
          },
        },
      },
    });

    const totals = new Map<
      number,
      { name: string; logo: string | null; quantity: number; revenueCents: number }
    >();
    for (const row of rows) {
      const brand = row.storeProduct?.product?.brand;
      if (!brand) continue;
      const current = totals.get(brand.id) ?? {
        name: brand.name,
        logo: brand.logo,
        quantity: 0,
        revenueCents: 0,
      };
      current.quantity += row.quantity;
      current.revenueCents += toCents(row.unitPrice.toNumber()) * row.quantity;
      totals.set(brand.id, current);
    }

    return [...totals.entries()]
      .sort(([, a], [, b]) => b.quantity - a.quantity || b.revenueCents - a.revenueCents)
      .slice(0, limit)
      .map(([brandId, brand]) => ({
        brandId,
        name: brand.name,
        logo: brand.logo,
        quantitySold: brand.quantity,
        revenue: fromCents(brand.revenueCents),
      }));
  },

  // Produtos com estoque (> 0) sem nenhuma venda PAGA desde `cutoff` — o filtro relacional
  // `saleItems: { none: {...} }` resolve isso direto no banco, sem agregação manual. Os mais críticos
  // primeiro (mais estoque parado). `lastSoldAt` null = nunca vendido (não só "não vendido no período").
  async staleProducts(storeId: string, cutoff: Date, limit: number): Promise<StaleProduct[]> {
    const rows = await prisma.storeProduct.findMany({
      where: {
        storeId,
        stock: { gt: 0 },
        saleItems: { none: { sale: { status: 'paid', createdAt: { gte: cutoff } } } },
      },
      select: {
        id: true,
        stock: true,
        price: true,
        name: true,
        image: true,
        product: { select: { name: true, productImageSm: true } },
      },
      orderBy: [{ stock: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    if (rows.length === 0) return [];

    // Uma consulta só pra todos: `distinct` + `orderBy` desc por data devolve a venda mais recente de
    // cada produto (Postgres via `DISTINCT ON`), sem uma query por produto.
    const ids = rows.map((row) => row.id);
    const lastSales = await prisma.saleItem.findMany({
      where: { storeProductId: { in: ids }, sale: { status: 'paid' } },
      distinct: ['storeProductId'],
      orderBy: [{ storeProductId: 'asc' }, { sale: { createdAt: 'desc' } }],
      select: { storeProductId: true, sale: { select: { createdAt: true } } },
    });
    const lastSoldById = new Map(
      lastSales.map((row) => [row.storeProductId as string, row.sale.createdAt]),
    );

    return rows.map((row) => ({
      storeProductId: row.id,
      name: row.product?.name ?? row.name ?? '',
      image: row.product?.productImageSm ?? row.image,
      stock: row.stock,
      price: row.price.toNumber(),
      lastSoldAt: lastSoldById.get(row.id) ?? null,
    }));
  },
};

export type SalesRepository = typeof salesRepository;
