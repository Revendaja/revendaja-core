import { z } from 'zod';
import { storefrontConfigSchema } from './storefront.config';
import {
  createPaymentMethodSchema,
  fulfillmentSchema,
  paymentMethodSchema,
  saleItemsSchema,
  saleStatusSchema,
} from '../sales/sales.schema';

// O usuário (handle) da loja na URL da vitrine: sempre minúsculo.
export const storefrontParamsSchema = z.object({
  handle: z.string().trim().toLowerCase().min(1).max(60),
});

export const storefrontQuerySchema = z.object({
  // Nome ou código de barras (mesma regra da busca de produtos da loja).
  search: z.string().trim().min(1).optional(),
  // Atalhos de categoria da vitrine: só os produtos dessa categoria própria da loja / dessa marca.
  category: z.string().uuid().optional(),
  brand: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(60).default(20),
});

const MAX_INSTALLMENTS = 24;
const MIN_ADDRESS = 8;
const MAX_ADDRESS = 300;
// Mesmo teto do total da venda (DECIMAL(12,2)).
const MAX_CHANGE_FOR = 9_999_999_999.99;

// Pedido do cliente. O preço NUNCA vem do cliente: o servidor usa o preço atual do produto.
export const onlineOrderSchema = z
  .object({
    // Gerado pelo revendaja-web (UUID) a cada tentativa de "finalizar pedido": repetir o mesmo
    // id devolve o mesmo pedido em vez de duplicá-lo (e de baixar o estoque de novo).
    clientRequestId: z.string().uuid(),
    customerName: z.string().trim().min(1).max(120),
    // A loja precisa falar com o cliente para combinar o pagamento. Aceita máscara: guarda só os dígitos.
    customerWhatsapp: z
      .string()
      .transform((value) => value.replace(/\D/g, ''))
      .pipe(z.string().min(10).max(15)),
    // Retirada na loja ou entrega.
    fulfillment: fulfillmentSchema,
    // Obrigatório na entrega (rua, número, bairro...). Texto livre do cliente.
    deliveryAddress: z.string().trim().min(MIN_ADDRESS).max(MAX_ADDRESS).nullish(),
    paymentMethod: createPaymentMethodSchema,
    // Só para cartão. Ausente no cartão = 1 parcela.
    installments: z.number().int().min(1).max(MAX_INSTALLMENTS).nullish(),
    // Só entrega paga em dinheiro: "troco para quanto" (a nota que o cliente vai entregar).
    // Ausente/null = não precisa de troco. Que seja >= total do pedido, só o servidor sabe checar.
    cashChangeFor: z.number().positive().max(MAX_CHANGE_FOR).nullish(),
    items: saleItemsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.installments != null && data.paymentMethod !== 'card') {
      ctx.addIssue({
        code: 'custom',
        message: 'Parcelas só se aplicam ao pagamento no cartão.',
        path: ['installments'],
      });
    }
    if (data.fulfillment === 'delivery' && !data.deliveryAddress) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o endereço de entrega.',
        path: ['deliveryAddress'],
      });
    }
    if (data.fulfillment === 'pickup' && data.deliveryAddress) {
      ctx.addIssue({
        code: 'custom',
        message: 'Endereço só se aplica à entrega.',
        path: ['deliveryAddress'],
      });
    }
    if (
      data.cashChangeFor != null &&
      !(data.fulfillment === 'delivery' && data.paymentMethod === 'cash')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Troco só se aplica à entrega paga em dinheiro.',
        path: ['cashChangeFor'],
      });
    }
  });

const storefrontProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  brand: z.string(),
  image: z.string().nullable(),
  imageSm: z.string().nullable(),
  price: z.number(),
  promoPrice: z.number().nullable(),
  isPromoActive: z.boolean(),
  inStock: z.boolean(),
  isNew: z.boolean(),
});

export const storefrontResponseSchema = z.object({
  store: z.object({
    storeName: z.string(),
    handle: z.string(),
    bio: z.string().nullable(),
    acceptedPaymentMethods: z.array(createPaymentMethodSchema),
  }),
  products: z.object({
    items: z.array(storefrontProductSchema),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});

export const storefrontHomeResponseSchema = z.object({
  store: z.object({
    storeName: z.string(),
    handle: z.string(),
    bio: z.string().nullable(),
    acceptedPaymentMethods: z.array(createPaymentMethodSchema),
    hideBranding: z.boolean(),
  }),
  config: storefrontConfigSchema,
  categories: z.array(
    z.object({
      type: z.enum(['category', 'brand']),
      id: z.string(),
      name: z.string(),
      count: z.number().int(),
      image: z.string().nullable(),
    }),
  ),
  featured: z.array(storefrontProductSchema),
  offers: z.object({
    products: z.array(storefrontProductSchema),
    endsAt: z.date().nullable(),
  }),
  newArrivals: z.array(storefrontProductSchema),
});

export const storefrontCustomizationResponseSchema = z.object({
  config: storefrontConfigSchema,
  defaults: storefrontConfigSchema,
  customized: z.object({
    announcement: z.boolean(),
    hero: z.boolean(),
    benefits: z.boolean(),
    flash: z.boolean(),
    collections: z.boolean(),
  }),
});

export const onlineOrderResponseSchema = z.object({
  number: z.number().int(),
  status: saleStatusSchema,
  total: z.number(),
  paymentMethod: paymentMethodSchema,
  installments: z.number().int().nullable(),
  customerName: z.string(),
  fulfillment: fulfillmentSchema,
  deliveryAddress: z.string().nullable(),
  cashChangeFor: z.number().nullable(),
  createdAt: z.date(),
  expiresAt: z.date(),
  items: z.array(
    z.object({
      productName: z.string(),
      quantity: z.number().int(),
      unitPrice: z.number(),
      subtotal: z.number(),
    }),
  ),
});

export const storeStatsResponseSchema = z.object({
  visitsLast7Days: z.number().int(),
  ordersCount: z.number().int(),
});

export type StorefrontParams = z.infer<typeof storefrontParamsSchema>;
export type StorefrontQuery = z.infer<typeof storefrontQuerySchema>;
export type OnlineOrderBody = z.infer<typeof onlineOrderSchema>;
