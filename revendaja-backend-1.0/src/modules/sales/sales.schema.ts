import { z } from 'zod';

// Formas de pagamento das RESPOSTAS. `on_account` (fiado) já existiu e segue no enum do banco:
// vendas antigas com essa forma de pagamento continuam aparecendo na lista e no detalhe.
export const paymentMethodSchema = z.enum(['pix', 'card', 'cash', 'on_account']);
// Formas de pagamento aceitas em vendas NOVAS: não há mais fiado, toda venda nasce paga.
export const createPaymentMethodSchema = z.enum(['pix', 'card', 'cash']);
export const saleStatusSchema = z.enum(['paid', 'pending', 'cancelled']);
export const saleSourceSchema = z.enum(['manual', 'online']);
export const fulfillmentSchema = z.enum(['pickup', 'delivery']);

// Tetos que só existem para não estourar os tipos do banco / evitar valores
// absurdos por engano de digitação — não são regras de negócio.
const MAX_QUANTITY = 1_000_000;
const MAX_ITEMS_PER_SALE = 50;
const MAX_INSTALLMENTS = 24;

// Itens de uma venda. Ninguém envia preço: ele vem sempre do preço atual do produto da loja.
export const saleItemsSchema = z
  .array(
    z.object({
      storeProductId: z.string().uuid(),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  )
  .min(1)
  .max(MAX_ITEMS_PER_SALE);

export const createSaleSchema = z
  .object({
    // Gerado pelo app (UUID) a cada tentativa de "finalizar venda": repetir o
    // mesmo id devolve a mesma venda em vez de duplicá-la.
    clientRequestId: z.string().uuid(),
    // Não há cadastro de clientes: o nome é digitado na hora da venda.
    customerName: z.string().trim().min(1).max(120),
    paymentMethod: createPaymentMethodSchema,
    // Só para cartão. Ausente no cartão = 1 parcela. null é tratado como ausente.
    installments: z.number().int().min(1).max(MAX_INSTALLMENTS).nullish(),
    items: saleItemsSchema,
  })
  .refine((data) => data.installments == null || data.paymentMethod === 'card', {
    message: 'Parcelas só se aplicam ao pagamento no cartão.',
    path: ['installments'],
  });

// Datas ISO-8601 estritas (com 'Z' ou offset, ex.: 2026-09-01T03:00:00.000Z ou
// 2026-09-01T00:00:00-03:00). `from` é inclusivo e `to` é exclusivo.
export const isoDateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const fromBeforeTo = (data: { from?: Date; to?: Date }) =>
  data.from === undefined || data.to === undefined || data.from < data.to;

export const listSalesQuerySchema = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    status: saleStatusSchema.optional(),
    // `online` = pedidos feitos pelo cliente na vitrine; `manual` = registradas pela loja.
    source: saleSourceSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine(fromBeforeTo, { message: 'from deve ser anterior a to.', path: ['from'] });

// No resumo o período é obrigatório: sem ele o app poderia exibir, sem perceber,
// os números "de todos os tempos" como se fossem do período escolhido.
export const salesSummaryQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
    // Só as vendas dessa origem (ex.: `online` = pedidos da vitrine). Sem ele, todas.
    source: saleSourceSchema.optional(),
  })
  .refine(fromBeforeTo, { message: 'from deve ser anterior a to.', path: ['from'] });

export const saleParamsSchema = z.object({
  id: z.string().uuid(),
});

// Uma venda PENDENTE pode virar paga (a loja recebeu) ou cancelada (o estoque reservado volta). Não
// existe outra transição: nada volta a pendente e uma venda paga não cancela.
export const updateSaleStatusSchema = z.object({
  status: z.enum(['paid', 'cancelled']),
});

export const saleListItemResponseSchema = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  createdAt: z.date(),
  status: saleStatusSchema,
  source: saleSourceSchema,
  paymentMethod: paymentMethodSchema,
  installments: z.number().int().nullable(),
  total: z.number(),
  customerName: z.string(),
  customerWhatsapp: z.string().nullable(),
  fulfillment: fulfillmentSchema.nullable(),
});

export const saleItemResponseSchema = z.object({
  storeProductId: z.string().uuid().nullable(),
  productName: z.string(),
  productImageSm: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number(),
  subtotal: z.number(),
});

export const saleResponseSchema = saleListItemResponseSchema.extend({
  items: z.array(saleItemResponseSchema),
  deliveryAddress: z.string().nullable(),
  cashChangeFor: z.number().nullable(),
});

export const paginatedSalesResponseSchema = z.object({
  items: z.array(saleListItemResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export const salesSummaryResponseSchema = z.object({
  grossRevenue: z.number(),
  pendingTotal: z.number(),
  profit: z.number().nullable(),
  marginPercent: z.number().nullable(),
  profitIsPartial: z.boolean(),
});

// --- Relatórios: mais vendidos / parados -------------------------------------

export const topProductsQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
    limit: z.coerce.number().int().positive().max(50).default(10),
  })
  .refine(fromBeforeTo, { message: 'from deve ser anterior a to.', path: ['from'] });

export const topBrandsQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
    limit: z.coerce.number().int().positive().max(20).default(5),
  })
  .refine(fromBeforeTo, { message: 'from deve ser anterior a to.', path: ['from'] });

export const topBrandsResponseSchema = z.object({
  items: z.array(
    z.object({
      brandId: z.number().int(),
      name: z.string(),
      logo: z.string().nullable(),
      quantitySold: z.number().int(),
      revenue: z.number(),
    }),
  ),
});

export const staleProductsQuerySchema = z.object({
  // Sem venda paga nos últimos `days` dias.
  days: z.coerce.number().int().positive().max(365).default(30),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// --- Evolução no tempo (gráfico do painel) -----------------------------------

const MAX_TIMELINE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export const salesTimelineQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
    groupBy: z.enum(['day', 'week', 'month']).default('month'),
    // Fuso de quem consulta, em minutos a LESTE de UTC (Brasil: -180). Define onde o dia/mês começa.
    tzOffsetMinutes: z.coerce.number().int().min(-720).max(840).default(0),
  })
  .refine(fromBeforeTo, { message: 'from deve ser anterior a to.', path: ['from'] })
  .refine((data) => data.to.getTime() - data.from.getTime() <= MAX_TIMELINE_DAYS * DAY_MS, {
    message: `O período não pode passar de ${MAX_TIMELINE_DAYS} dias.`,
    path: ['to'],
  });

export const salesTimelineResponseSchema = z.object({
  groupBy: z.enum(['day', 'week', 'month']),
  costIsPartial: z.boolean(),
  items: z.array(
    z.object({
      periodStart: z.date(),
      revenue: z.number(),
      cost: z.number(),
    }),
  ),
});

export const topProductsResponseSchema = z.object({
  items: z.array(
    z.object({
      storeProductId: z.string().uuid(),
      name: z.string(),
      image: z.string().nullable(),
      quantitySold: z.number().int(),
      revenue: z.number(),
    }),
  ),
});

export const staleProductsResponseSchema = z.object({
  items: z.array(
    z.object({
      storeProductId: z.string().uuid(),
      name: z.string(),
      image: z.string().nullable(),
      stock: z.number().int(),
      price: z.number(),
      // null = nunca vendido (não só "sem venda no período").
      lastSoldAt: z.date().nullable(),
    }),
  ),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
export type SaleParams = z.infer<typeof saleParamsSchema>;
export type UpdateSaleStatusBody = z.infer<typeof updateSaleStatusSchema>;
export type SalesTimelineQuery = z.infer<typeof salesTimelineQuerySchema>;
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;
export type TopBrandsQuery = z.infer<typeof topBrandsQuerySchema>;
export type StaleProductsQuery = z.infer<typeof staleProductsQuerySchema>;
