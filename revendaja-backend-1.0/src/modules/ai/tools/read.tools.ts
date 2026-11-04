import { z } from 'zod';
import { catalogService } from '../../catalog/catalog.service';
import { salesService } from '../../sales/sales.service';
import { resolvePeriod } from '../ai.period';
import { aiQueries } from '../ai.queries';
import { defineReadTool, type UiCard } from '../ai.types';
import { normalizeText, periodShape, roundMoney } from './tools.shared';

// Ferramentas de LEITURA. Os números (somas, lucro, margem) saem sempre do backend; o modelo só
// os interpreta e explica.

export const searchCatalogTool = defineReadTool({
  name: 'search_catalog',
  description:
    'Pesquisa produtos no catálogo geral do Revendaja (cerca de 27 mil produtos) por nome ou código de barras. Use antes de cadastrar um produto no estoque ou para responder o preço sugerido de um produto. Devolve até 8 produtos; o app já mostra a foto e os dados de cada um para a usuária.',
  input: z.object({
    query: z.string().trim().min(2).max(100).describe('Nome do produto, ou código de barras.'),
    brand: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .optional()
      .describe('Marca, para filtrar (ex.: Natura).'),
    limit: z.number().int().min(1).max(8).default(5).describe('Quantos produtos trazer.'),
  }),
  async run(ctx, input) {
    let brandId: number | undefined;
    if (input.brand) {
      const wanted = normalizeText(input.brand);
      const brands = await catalogService.listBrands();
      brandId = brands.find((brand) => normalizeText(brand.name).includes(wanted))?.id ?? undefined;
    }

    const result = await catalogService.listProducts({
      search: input.query,
      brandId,
      page: 1,
      pageSize: input.limit,
    });

    const inStore = await aiQueries.storeProductIdsByCatalogId(
      ctx.storeId,
      result.items.flatMap((product) => (product.id === null ? [] : [product.id])),
    );

    const cards: UiCard[] = [];
    for (const product of result.items) {
      if (product.id === null) continue;
      cards.push({
        type: 'catalog_product',
        productId: product.id,
        name: product.name,
        brand: product.brand.name,
        image: product.productImageSm ?? product.productImage,
        price: product.basePrice,
        storeProductId: inStore.get(product.id) ?? null,
      });
    }

    return {
      cards,
      data: {
        total: result.total,
        shown: cards.length,
        products: cards.map((card) =>
          card.type === 'catalog_product'
            ? {
                productId: card.productId,
                name: card.name,
                brand: card.brand,
                suggestedPrice: card.price,
                alreadyInStore: card.storeProductId !== null,
                storeProductId: card.storeProductId,
              }
            : null,
        ),
      },
    };
  },
});

export const searchMyStockTool = defineReadTool({
  name: 'search_my_stock',
  description:
    'Lista produtos do estoque da própria loja, com quantidade, estoque mínimo e preço. Use para "quais produtos estão em falta", "quanto tenho de X em estoque", "o que está com estoque baixo". O app já mostra os cartões dos produtos.',
  input: z.object({
    query: z.string().trim().min(1).max(100).optional().describe('Nome do produto (opcional).'),
    brand: z.string().trim().min(2).max(60).optional().describe('Marca (ex.: Natura).'),
    status: z
      .enum(['all', 'out', 'low', 'in'])
      .default('all')
      .describe(
        'all = todos; out = em falta (estoque 0); low = estoque baixo (no mínimo configurado ou abaixo); in = com estoque.',
      ),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, input) {
    const { items, total } = await aiQueries.searchStock(ctx.storeId, {
      search: input.query,
      brand: input.brand,
      status: input.status,
      limit: input.limit,
    });

    return {
      cards: items.map((item) => ({ type: 'stock_product' as const, ...item })),
      data: {
        total,
        shown: items.length,
        products: items.map((item) => ({
          storeProductId: item.storeProductId,
          name: item.name,
          brand: item.brand,
          stock: item.stock,
          minStock: item.minStock,
          price: item.price,
        })),
      },
    };
  },
});

export const staleProductsTool = defineReadTool({
  name: 'get_stale_products',
  description:
    'Produtos em estoque que não vendem há N dias (ou nunca venderam). Use para produtos parados e para sugerir promoções.',
  input: z.object({
    days: z.number().int().min(7).max(365).default(30).describe('Sem vender há pelo menos N dias.'),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, input) {
    const items = await salesService.staleProducts(ctx.userId, input.days, input.limit);
    return {
      data: {
        days: input.days,
        products: items.map((item) => ({
          storeProductId: item.storeProductId,
          name: item.name,
          stock: item.stock,
          price: item.price,
          lastSoldAt: item.lastSoldAt,
        })),
      },
    };
  },
});

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return roundMoney(((current - previous) / previous) * 100);
}

export const financeSummaryTool = defineReadTool({
  name: 'get_finance_summary',
  description:
    'Resumo financeiro das vendas de um período: faturamento (vendas pagas), a receber (vendas pendentes), lucro e margem. Todos os valores são calculados pelo sistema. Não inclui boletos nem despesas (ainda não existem no app).',
  input: z.object({
    ...periodShape,
    compareWithPrevious: z
      .boolean()
      .default(false)
      .describe('Traz também o período anterior de mesmo tamanho e a variação.'),
  }),
  async run(ctx, input) {
    const period = resolvePeriod(input);
    const current = await salesService.summary(ctx.userId, period.from, period.to);

    const data: Record<string, unknown> = {
      period: period.label,
      from: period.from,
      to: period.to,
      grossRevenue: current.grossRevenue,
      pendingToReceive: current.pendingTotal,
      profit: current.profit,
      marginPercent: current.marginPercent,
      // true = há venda paga com produto sem custo informado: o lucro é parcial.
      profitIsPartial: current.profitIsPartial,
    };

    if (input.compareWithPrevious) {
      const previous = await salesService.summary(
        ctx.userId,
        period.previous.from,
        period.previous.to,
      );
      data.previous = {
        period: period.previous.label,
        grossRevenue: previous.grossRevenue,
        profit: previous.profit,
        marginPercent: previous.marginPercent,
      };
      data.revenueChangePercent = percentChange(current.grossRevenue, previous.grossRevenue);
      data.profitChangePercent =
        current.profit !== null && previous.profit !== null
          ? percentChange(current.profit, previous.profit)
          : null;
    }

    return { data };
  },
});

export const topProductsTool = defineReadTool({
  name: 'get_top_products',
  description: 'Produtos mais vendidos de um período, com quantidade vendida e faturamento.',
  input: z.object({
    ...periodShape,
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async run(ctx, input) {
    const period = resolvePeriod(input);
    const items = await salesService.topProducts(ctx.userId, period.from, period.to, input.limit);
    return {
      data: {
        period: period.label,
        products: items.map((item) => ({
          name: item.name,
          quantitySold: item.quantitySold,
          revenue: item.revenue,
        })),
      },
    };
  },
});

export const stockValueTool = defineReadTool({
  name: 'get_stock_value',
  description:
    'Quanto a loja tem investido em estoque (pelo preço de custo) e quanto faturaria vendendo todo o estoque pelo preço atual.',
  input: z.object({}),
  async run(ctx) {
    const value = await aiQueries.stockValue(ctx.storeId);
    return {
      data: {
        investedInStock: roundMoney(value.invested),
        potentialRevenue: roundMoney(value.potentialRevenue),
        // Só é uma conta justa quando todos os produtos em estoque têm custo informado.
        potentialProfit:
          value.productsWithoutCost === 0
            ? roundMoney(value.potentialRevenue - value.invested)
            : null,
        units: value.units,
        productsInStock: value.productsInStock,
        productsWithoutCost: value.productsWithoutCost,
      },
    };
  },
});

export const READ_TOOLS = [
  searchCatalogTool,
  searchMyStockTool,
  staleProductsTool,
  financeSummaryTool,
  topProductsTool,
  stockValueTool,
];
