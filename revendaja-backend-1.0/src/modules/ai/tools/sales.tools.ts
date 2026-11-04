import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { salesService } from '../../sales/sales.service';
import { PERIODS, resolvePeriod, type PeriodInput } from '../ai.period';
import { aiQueries } from '../ai.queries';
import { defineReadTool, defineWriteTool } from '../ai.types';
import { formatBRL, periodShape, roundMoney } from './tools.shared';

// Vendas e clientes. O app não tem cadastro de clientes nem fiado: a "cliente" é o nome digitado
// na venda, e toda venda registrada pela loja nasce paga. Só o pedido da vitrine online fica
// pendente (até a loja marcar como pago).

const PAYMENT_LABEL: Record<string, string> = {
  pix: 'Pix',
  card: 'cartão',
  cash: 'dinheiro',
  on_account: 'fiado',
};

const optionalPeriodShape = { ...periodShape, period: z.enum(PERIODS).optional() };

function optionalRange(input: {
  period?: PeriodInput['period'];
  startDate?: string;
  endDate?: string;
}) {
  if (!input.period) return undefined;
  return resolvePeriod({
    period: input.period,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

const saleNumberSchema = z.number().int().positive().describe('Número da venda (Venda #N).');

async function findSaleOrThrow(ctx: { userId: string; storeId: string }, saleNumber: number) {
  const saleId = await aiQueries.findSaleIdByNumber(ctx.storeId, saleNumber);
  if (!saleId) throw new NotFoundError(`Não encontrei a venda #${saleNumber}.`);
  return salesService.get(ctx.userId, saleId);
}

export const listSalesTool = defineReadTool({
  name: 'list_sales',
  description:
    'Lista vendas da loja, da mais recente para a mais antiga. Filtros opcionais: período, status (paid = paga, pending = pendente/a receber, cancelled) e origem (manual = registrada pela loja, online = pedido da vitrine). Use para "pedidos online pendentes", "minhas últimas vendas".',
  input: z.object({
    ...optionalPeriodShape,
    status: z.enum(['paid', 'pending', 'cancelled']).optional(),
    source: z.enum(['manual', 'online']).optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, input) {
    const range = optionalRange(input);
    const result = await salesService.list(ctx.userId, {
      from: range?.from,
      to: range?.to,
      status: input.status,
      source: input.source,
      page: 1,
      pageSize: input.limit,
    });
    return {
      data: {
        total: result.total,
        shown: result.items.length,
        sales: result.items.map((sale) => ({
          number: sale.number,
          createdAt: sale.createdAt,
          customer: sale.customerName,
          status: sale.status,
          source: sale.source,
          payment: PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod,
          total: sale.total,
          fulfillment: sale.fulfillment,
        })),
      },
    };
  },
});

export const getSaleTool = defineReadTool({
  name: 'get_sale',
  description: 'Detalhes de uma venda (itens, valores, forma de pagamento) pelo número da venda.',
  input: z.object({ saleNumber: saleNumberSchema }),
  async run(ctx, input) {
    const sale = await findSaleOrThrow(ctx, input.saleNumber);
    return {
      data: {
        number: sale.number,
        createdAt: sale.createdAt,
        customer: sale.customerName,
        status: sale.status,
        source: sale.source,
        payment: PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod,
        installments: sale.installments,
        total: sale.total,
        fulfillment: sale.fulfillment,
        deliveryAddress: sale.deliveryAddress,
        items: sale.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        })),
      },
    };
  },
});

export const customersTool = defineReadTool({
  name: 'get_customers',
  description:
    'Clientes da loja com quantas compras fizeram, quanto gastaram, quanto têm pendente e quando compraram pela última vez. Ordenação: spent (quem mais gastou), recent (compraram há pouco), inactive (há mais tempo sem comprar), pending (maior valor pendente). Os clientes são identificados pelo nome digitado na venda (o app não tem cadastro). Use para "quais clientes estão há mais tempo sem comprar", "quem tem pagamento pendente".',
  input: z.object({
    search: z.string().trim().min(1).max(60).optional().describe('Parte do nome da cliente.'),
    sort: z.enum(['spent', 'recent', 'inactive', 'pending']).default('spent'),
    inactiveDays: z
      .number()
      .int()
      .min(7)
      .max(730)
      .optional()
      .describe('Só quem não compra há pelo menos N dias.'),
    onlyWithPending: z.boolean().default(false).describe('Só quem tem valor pendente.'),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, input) {
    const customers = await aiQueries.customerSummaries(ctx.storeId, {
      search: input.search,
      sort: input.sort,
      inactiveSince: input.inactiveDays
        ? new Date(Date.now() - input.inactiveDays * 24 * 60 * 60 * 1000)
        : undefined,
      onlyWithPending: input.onlyWithPending,
      limit: input.limit,
    });
    return {
      data: {
        note: 'Clientes identificados pelo nome digitado na venda; o mesmo nome escrito de formas diferentes pode aparecer como pessoas diferentes.',
        customers: customers.map((customer) => ({
          name: customer.name,
          purchases: customer.purchases,
          totalSpent: roundMoney(customer.totalSpent),
          pendingAmount: roundMoney(customer.pendingAmount),
          lastPurchaseAt: customer.lastPurchaseAt,
        })),
      },
    };
  },
});

export const customerHistoryTool = defineReadTool({
  name: 'get_customer_history',
  description:
    'Histórico de compras de uma cliente pelo nome (as vendas mais recentes e o que levou).',
  input: z.object({
    name: z.string().trim().min(1).max(120).describe('Nome da cliente como aparece nas vendas.'),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, input) {
    const sales = await aiQueries.customerSales(ctx.storeId, input.name, input.limit);
    if (sales.length === 0) {
      throw new NotFoundError(`Não encontrei vendas para "${input.name}".`);
    }
    return {
      data: {
        customer: input.name,
        sales: sales.map((sale) => ({
          number: sale.number,
          createdAt: sale.createdAt,
          status: sale.status,
          payment: PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod,
          total: sale.total,
          items: sale.items,
        })),
      },
    };
  },
});

export const salesTimelineTool = defineReadTool({
  name: 'get_sales_timeline',
  description:
    'Faturamento e custo por dia, semana ou mês dentro de um período. Use para comparar meses ou ver a evolução das vendas.',
  input: z.object({
    ...periodShape,
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
  }),
  async run(ctx, input) {
    const range = resolvePeriod(input);
    const timeline = await salesService.timeline(ctx.userId, {
      from: range.from,
      to: range.to,
      groupBy: input.groupBy,
      // Brasília: onde o dia/mês começa.
      tzOffsetMinutes: -180,
    });
    return {
      data: {
        period: range.label,
        groupBy: timeline.groupBy,
        costIsPartial: timeline.costIsPartial,
        points: timeline.items.map((point) => ({
          periodStart: point.periodStart,
          revenue: roundMoney(point.revenue),
          cost: roundMoney(point.cost),
        })),
      },
    };
  },
});

export const topBrandsTool = defineReadTool({
  name: 'get_top_brands',
  description: 'Marcas que mais vendem em um período, com quantidade vendida e faturamento.',
  input: z.object({ ...periodShape, limit: z.number().int().min(1).max(10).default(5) }),
  async run(ctx, input) {
    const range = resolvePeriod(input);
    const brands = await salesService.topBrands(ctx.userId, range.from, range.to, input.limit);
    return {
      data: {
        period: range.label,
        brands: brands.map((brand) => ({
          name: brand.name,
          quantitySold: brand.quantitySold,
          revenue: brand.revenue,
        })),
      },
    };
  },
});

// ---- Escrita ----------------------------------------------------------------------------------

const registerSaleInput = z
  .object({
    customerName: z.string().trim().min(1).max(120).describe('Nome da cliente.'),
    items: z
      .array(
        z.object({
          storeProductId: z.string().uuid().describe('Id do produto na loja (de search_my_stock).'),
          quantity: z.number().int().min(1).max(1_000_000),
        }),
      )
      .min(1)
      .max(50),
    paymentMethod: z.enum(['pix', 'card', 'cash']),
    installments: z.number().int().min(1).max(24).optional().describe('Parcelas, só para cartão.'),
  })
  .refine((data) => data.installments === undefined || data.paymentMethod === 'card', {
    message: 'Parcelas só se aplicam ao pagamento no cartão.',
    path: ['installments'],
  });

export const registerSaleTool = defineWriteTool({
  name: 'propose_register_sale',
  description:
    'Propõe registrar uma venda: baixa o estoque e grava o preço do momento. NÃO executa: a usuária precisa confirmar no app. Os preços vêm sempre do cadastro dos produtos (não os invente). Toda venda registrada pela loja nasce paga.',
  input: registerSaleInput,
  // `clientRequestId` é gerado na proposta: se a confirmação for repetida, o servidor devolve a mesma
  // venda em vez de criar outra.
  payloadSchema: registerSaleInput.safeExtend({ clientRequestId: z.string().uuid() }),
  async prepare(ctx, input) {
    const ids = input.items.map((item) => item.storeProductId);
    if (new Set(ids).size !== ids.length) {
      throw new AppError(
        'O mesmo produto aparece mais de uma vez. Some as quantidades em um único item.',
        400,
        'DUPLICATE_SALE_ITEM',
      );
    }

    const lines: { name: string; quantity: number; subtotal: number }[] = [];
    for (const item of input.items) {
      const row = await aiQueries.findStockRow(ctx.storeId, item.storeProductId);
      if (!row) throw new NotFoundError('Um dos produtos não está na sua loja.');
      if (item.quantity > row.stock) {
        throw new AppError(
          `Estoque insuficiente para "${row.name}": tem ${row.stock}, o pedido é de ${item.quantity}.`,
          409,
          'INSUFFICIENT_STOCK',
        );
      }
      lines.push({
        name: row.name,
        quantity: item.quantity,
        subtotal: roundMoney(row.effectivePrice * item.quantity),
      });
    }

    const total = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0));
    const payment =
      input.paymentMethod === 'card' && (input.installments ?? 1) > 1
        ? `cartão em ${input.installments}x`
        : PAYMENT_LABEL[input.paymentMethod];
    const list = lines.map((line) => `${line.quantity}x ${line.name}`).join(', ');

    return {
      summary: `Registrar venda para ${input.customerName}: ${list}. Total ${formatBRL(total)} no ${payment}.`,
      preview: { customerName: input.customerName, total, payment, items: lines },
      payload: { ...input, clientRequestId: randomUUID() },
    };
  },
  async apply(ctx, payload) {
    const { sale } = await salesService.create(ctx.userId, {
      clientRequestId: payload.clientRequestId,
      customerName: payload.customerName,
      paymentMethod: payload.paymentMethod,
      installments: payload.installments ?? null,
      items: payload.items,
    });
    return { saleNumber: sale.number, total: sale.total };
  },
});

const saleStatusInput = z.object({ saleNumber: saleNumberSchema });

export const markSalePaidTool = defineWriteTool({
  name: 'propose_mark_sale_paid',
  description:
    'Propõe marcar uma venda pendente (por exemplo, um pedido da vitrine online) como paga. NÃO executa: a usuária precisa confirmar.',
  input: saleStatusInput,
  payloadSchema: z.object({ saleId: z.string().uuid(), saleNumber: z.number().int() }),
  async prepare(ctx, input) {
    const sale = await findSaleOrThrow(ctx, input.saleNumber);
    if (sale.status === 'paid') {
      throw new AppError(`A venda #${sale.number} já está paga.`, 409, 'ALREADY_PAID');
    }
    if (sale.status === 'cancelled') {
      throw new AppError(
        `A venda #${sale.number} foi cancelada e não pode ser paga.`,
        409,
        'SALE_CANCELLED',
      );
    }
    return {
      summary: `Marcar a venda #${sale.number} (${sale.customerName}, ${formatBRL(sale.total)}) como paga.`,
      preview: { saleNumber: sale.number, customer: sale.customerName, total: sale.total },
      payload: { saleId: sale.id, saleNumber: sale.number },
    };
  },
  async apply(ctx, payload) {
    const sale = await salesService.markPaid(ctx.userId, payload.saleId);
    return { saleNumber: sale.number, status: sale.status };
  },
});

export const cancelSaleTool = defineWriteTool({
  name: 'propose_cancel_sale',
  description:
    'Propõe cancelar uma venda PENDENTE (o estoque reservado volta). Venda já paga não pode ser cancelada. NÃO executa: a usuária precisa confirmar.',
  input: saleStatusInput,
  payloadSchema: z.object({ saleId: z.string().uuid(), saleNumber: z.number().int() }),
  async prepare(ctx, input) {
    const sale = await findSaleOrThrow(ctx, input.saleNumber);
    if (sale.status === 'paid') {
      throw new AppError(
        `A venda #${sale.number} já foi paga e não pode ser cancelada.`,
        409,
        'SALE_PAID',
      );
    }
    if (sale.status === 'cancelled') {
      throw new AppError(`A venda #${sale.number} já está cancelada.`, 409, 'ALREADY_CANCELLED');
    }
    return {
      summary: `Cancelar a venda #${sale.number} (${sale.customerName}, ${formatBRL(sale.total)}). O estoque reservado volta.`,
      preview: { saleNumber: sale.number, customer: sale.customerName, total: sale.total },
      payload: { saleId: sale.id, saleNumber: sale.number },
    };
  },
  async apply(ctx, payload) {
    const sale = await salesService.cancel(ctx.userId, payload.saleId);
    return { saleNumber: sale.number, status: sale.status };
  },
});

export const SALES_TOOLS = [
  listSalesTool,
  getSaleTool,
  customersTool,
  customerHistoryTool,
  salesTimelineTool,
  topBrandsTool,
  registerSaleTool,
  markSalePaidTool,
  cancelSaleTool,
];
