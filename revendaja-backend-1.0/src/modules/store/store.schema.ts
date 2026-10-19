import { z } from 'zod';
import { env } from '../../config/env';
import { catalogProductResponseSchema } from '../catalog/catalog.schema';
import { createPaymentMethodSchema } from '../sales/sales.schema';

export const createStoreSchema = z.object({
  storeName: z.string().min(2).max(120),
});

// O handle vira o subdomínio da vitrine (https://{handle}.dominio): só letras minúsculas, números
// e hífen (sem começar, terminar ou repetir hífen) e cabe num rótulo de DNS (até 63 caracteres).
// Maiúsculas são aceitas e viram minúsculas.
export const storeHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'Use só letras minúsculas, números e hífen (sem começar, terminar ou repetir o hífen).',
  });

// Teto de estoque por produto: só existe para evitar estouro do INTEGER do banco
// (e valores absurdos por engano de digitação) — não é uma regra de negócio.
const MAX_STOCK = 1_000_000;

const stockSchema = z.number().int().nonnegative().max(MAX_STOCK);

export const storeResponseSchema = z.object({
  id: z.string().uuid(),
  storeName: z.string(),
  handle: z.string(),
  catalogLink: z.string().url(),
  isOnline: z.boolean(),
  bio: z.string().nullable(),
  defaultMinStock: z.number().int(),
  createdAt: z.date(),
});

// Minha Loja (liga/desliga a vitrine) e Editar Loja (nome, link, descrição e estoque mínimo padrão).
// Cada campo é opcional e só muda o que vier, mas ao menos um é obrigatório. `bio` vazia ou nula
// LIMPA a descrição.
export const updateStoreSchema = z
  .object({
    isOnline: z.boolean().optional(),
    storeName: z.string().trim().min(2).max(120).optional(),
    handle: storeHandleSchema.optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    // Valor inicial pra produto NOVO (ver StoreService#addProduct/addManualProduct) e também
    // aplicado a quem já está na loja e ainda segue o padrão ANTIGO — não toca em quem já tem um
    // `minStock` próprio, diferente do padrão anterior (ver StoreService#updateStore). 0 = desligar.
    defaultMinStock: stockSchema.optional(),
  })
  .refine(
    (data) =>
      data.isOnline !== undefined ||
      data.storeName !== undefined ||
      data.handle !== undefined ||
      data.bio !== undefined ||
      data.defaultMinStock !== undefined,
    { message: 'Informe isOnline, storeName, handle, bio e/ou defaultMinStock.' },
  );

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

// --- Meta de vendas ---------------------------------------------------------

// A meta é DECIMAL(12,2) no banco (mesma precisão do total de uma venda): acima
// disso o UPDATE estoura. O piso de 0,01 evita meta "zero" (dividiria o progresso).
const MIN_GOAL = 0.01;
const MAX_GOAL = 9_999_999_999.99;

// A meta é escolhida no início e depois só é trocada por outra: não há como removê-la.
export const setMonthlyGoalSchema = z.object({
  monthlyGoal: z.number().min(MIN_GOAL).max(MAX_GOAL),
});

export const monthlyGoalResponseSchema = z.object({
  monthlyGoal: z.number(),
});

export type SetMonthlyGoalInput = z.infer<typeof setMonthlyGoalSchema>;

// --- Configurações da tela Mais ---------------------------------------------

// Mesmas formas de pagamento de uma venda nova: pix, card e cash (sem fiado).
const acceptedPaymentMethodSchema = createPaymentMethodSchema;

export const updateStoreSettingsSchema = z
  .object({
    // A vitrine precisa aceitar ao menos uma forma de pagamento; sem repetidos.
    acceptedPaymentMethods: z
      .array(acceptedPaymentMethodSchema)
      .min(1)
      .refine((methods) => new Set(methods).size === methods.length, {
        message: 'Não repita a mesma forma de pagamento.',
      })
      .optional(),
    hideOutOfStock: z.boolean().optional(),
  })
  .refine(
    (data) => data.acceptedPaymentMethods !== undefined || data.hideOutOfStock !== undefined,
    {
      message: 'Informe acceptedPaymentMethods e/ou hideOutOfStock.',
    },
  );

export const storeSettingsResponseSchema = z.object({
  plan: z.object({
    id: z.enum(['free', 'starter', 'premium', 'business']),
    name: z.string(),
  }),
  acceptedPaymentMethods: z.array(acceptedPaymentMethodSchema),
  hideOutOfStock: z.boolean(),
});

// Plano da loja com os limites e o uso atual (card "Limite do plano" do painel web).
export const storePlanUsageResponseSchema = z.object({
  plan: z.object({
    id: z.enum(['free', 'starter', 'premium', 'business']),
    name: z.string(),
  }),
  limits: z.object({
    // null = sem limite de produtos.
    maxProducts: z.number().int().nullable(),
    manualProductsEnabled: z.boolean(),
    categoriesEnabled: z.boolean(),
    promotionsEnabled: z.boolean(),
  }),
  usage: z.object({
    products: z.number().int(),
    frozen: z.number().int(),
  }),
});

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;

// --- Produtos da loja (StoreProduct) ---------------------------------------

// Preços e custos são DECIMAL(10,2) no banco: acima disso o INSERT estoura (e
// viraria erro 500). Casas além da segunda são arredondadas pelo banco.
const MAX_MONEY = 99_999_999.99;

const priceSchema = z.number().nonnegative().max(MAX_MONEY);

// Estoque mínimo para o alerta de estoque baixo (notificação automática). Opcional: sem `minStock`
// o produto usa o `defaultMinStock` da loja (ver StoreService#addProduct/addManualProduct) — e se a
// loja também nunca configurou um, o alerta fica desligado (0 = desligado).
const minStockSchema = stockSchema.optional();

export const addStoreProductSchema = z.object({
  productId: z.number().int().positive(),
  price: priceSchema,
  // Preço de custo (opcional). Ausente ou null = "não informado".
  costPrice: priceSchema.nullish(),
  // Opcional: sem `stock` o produto entra com estoque 0.
  stock: stockSchema.default(0),
  minStock: minStockSchema,
});

// --- Produto manual (fora do catálogo, ex.: um ursinho ou uma cesta de presente) -------------

const manualProductNameSchema = z.string().trim().min(2).max(120);
const manualProductDescriptionSchema = z.string().trim().max(500).nullable();
// URL devolvida por POST /uploads/product-image — o app sempre sobe a imagem antes de criar/editar.
// Só aceita uma URL do NOSSO bucket (não qualquer URL de imagem): evita que alguém grave um link
// arbitrário ali por fora do fluxo de upload normal.
const manualProductImageSchema = z
  .string()
  .url()
  .max(2048)
  .refine(
    (url) => env.S3_PUBLIC_BASE_URL !== undefined && url.startsWith(`${env.S3_PUBLIC_BASE_URL}/`),
    {
      message:
        'Imagem inválida. Envie a imagem por /uploads/product-image antes de salvar o produto.',
    },
  )
  .nullable();

const MAX_KIT_COMPONENTS = 30;

// Um componente do "kit": outro produto da MESMA loja (do catálogo ou manual) debitado do estoque
// junto quando o kit é vendido. Só 1 nível — o componente não pode ele mesmo ter componentes, mas
// isso é validado no service (não dá pra expressar "olhar outro registro" só com zod).
const manualProductComponentsSchema = z
  .array(
    z.object({
      storeProductId: z.string().uuid(),
      quantity: z.number().int().positive().max(9999),
    }),
  )
  .max(MAX_KIT_COMPONENTS)
  .refine((items) => new Set(items.map((item) => item.storeProductId)).size === items.length, {
    message: 'O mesmo produto não pode aparecer duas vezes na lista de componentes.',
  });

export const createManualStoreProductSchema = z.object({
  name: manualProductNameSchema,
  description: manualProductDescriptionSchema.optional(),
  image: manualProductImageSchema.optional(),
  price: priceSchema,
  costPrice: priceSchema.nullish(),
  stock: stockSchema.default(0),
  minStock: minStockSchema,
  // Ausente = produto simples (sem kit). Presente (mesmo vazio) define a composição do kit.
  components: manualProductComponentsSchema.optional(),
});

// --- Preço promocional (desconto temporário) --------------------------------

// Os dois campos sempre vêm juntos: os dois nulos = "remover promoção", os dois preenchidos =
// "definir promoção". Comparar `promoPrice` com o preço normal exige saber o preço vigente (que pode
// não estar vindo nesta mesma chamada) — isso é validado no service, não aqui.
const promoPriceSchema = priceSchema.nullable();
const promoEndsAtSchema = z.coerce.date().nullable();

export const updateStoreProductSchema = z
  .object({
    price: priceSchema.optional(),
    // null LIMPA o custo ("não informado"); ausente não mexe nele.
    costPrice: priceSchema.nullable().optional(),
    // Valor ABSOLUTO (define o estoque para esse número), não um ajuste +/-.
    stock: stockSchema.optional(),
    minStock: stockSchema.optional(),
    isActive: z.boolean().optional(),
    // null tira o produto da categoria; ausente não mexe nela.
    categoryId: z.string().uuid().nullable().optional(),
    promoPrice: promoPriceSchema.optional(),
    promoEndsAt: promoEndsAtSchema.optional(),
    // Os quatro campos abaixo só valem num produto manual (o service recusa num produto do
    // catálogo). `components`, quando enviado, SUBSTITUI a lista inteira de componentes do kit.
    name: manualProductNameSchema.optional(),
    description: manualProductDescriptionSchema.optional(),
    image: manualProductImageSchema.optional(),
    components: manualProductComponentsSchema.optional(),
  })
  .refine(
    (data) =>
      data.price !== undefined ||
      data.costPrice !== undefined ||
      data.stock !== undefined ||
      data.minStock !== undefined ||
      data.isActive !== undefined ||
      data.categoryId !== undefined ||
      data.promoPrice !== undefined ||
      data.promoEndsAt !== undefined ||
      data.name !== undefined ||
      data.description !== undefined ||
      data.image !== undefined ||
      data.components !== undefined,
    { message: 'Informe ao menos um campo para atualizar.' },
  )
  .refine((data) => (data.promoPrice === undefined) === (data.promoEndsAt === undefined), {
    message: 'Informe o preço promocional e a validade juntos.',
    path: ['promoPrice'],
  })
  .refine(
    (data) =>
      data.promoPrice === undefined || (data.promoPrice === null) === (data.promoEndsAt === null),
    {
      message: 'Para remover a promoção, envie os dois campos como nulos.',
      path: ['promoEndsAt'],
    },
  );

export const storeProductParamsSchema = z.object({
  id: z.string().uuid(),
});

export const sortOptionSchema = z.enum([
  'recent',
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'stock_asc',
]);

export const listStoreProductsQuerySchema = z.object({
  // Mesma regra da busca do catálogo: nome ou código de barras (8 a 14 dígitos).
  search: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  sort: sortOptionSchema.default('recent'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// --- Categorias da loja -------------------------------------------------------

export const createStoreCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const storeCategoryParamsSchema = z.object({
  id: z.string().uuid(),
});

export const storeCategoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  productCount: z.number().int(),
});

export const storeCategoriesResponseSchema = z.object({
  items: z.array(storeCategoryResponseSchema),
});

export type CreateStoreCategoryInput = z.infer<typeof createStoreCategorySchema>;
export type StoreCategoryParams = z.infer<typeof storeCategoryParamsSchema>;

export const storeProductComponentResponseSchema = z.object({
  // Id do vínculo (não do produto componente em si).
  id: z.string().uuid(),
  storeProductId: z.string().uuid(),
  name: z.string(),
  image: z.string().nullable(),
  price: z.number(),
  stock: z.number().int(),
  quantity: z.number().int(),
});

export const storeProductResponseSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['catalog', 'manual']),
  price: z.number(),
  costPrice: z.number().nullable(),
  promoPrice: z.number().nullable(),
  promoEndsAt: z.date().nullable(),
  // Calculado no servidor (`promoEndsAt` ainda no futuro): evita depender do relógio do aparelho.
  isPromoActive: z.boolean(),
  stock: z.number().int(),
  minStock: z.number().int(),
  isActive: z.boolean(),
  // Acima do limite do plano: fora da vitrine, mas pode ser apagado.
  isFrozen: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  product: catalogProductResponseSchema,
  category: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  // Componentes deste produto quando ele é um kit (ex.: a cesta). Vazio para produtos comuns.
  components: z.array(storeProductComponentResponseSchema),
});

export const paginatedStoreProductsResponseSchema = z.object({
  items: z.array(storeProductResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export type AddStoreProductInput = z.infer<typeof addStoreProductSchema>;
export type CreateManualStoreProductInput = z.infer<typeof createManualStoreProductSchema>;
export type UpdateStoreProductInput = z.infer<typeof updateStoreProductSchema>;
export type StoreProductParams = z.infer<typeof storeProductParamsSchema>;
export type SortOption = z.infer<typeof sortOptionSchema>;
export type ListStoreProductsQuery = z.infer<typeof listStoreProductsQuerySchema>;
