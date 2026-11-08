import { z } from 'zod';
import { AppError, NotFoundError, PlanLimitError } from '../../../shared/errors/AppError';
import { homeService } from '../../home/home.service';
import { storeRepository } from '../../store/store.repository';
import { STORE_PLAN_LIMITS, STORE_PLAN_NAMES, type StorePlanLimits } from '../../store/store.plans';
import { storeService } from '../../store/store.service';
import type { Store, StorePlan } from '../../store/store.types';
import { AI_PLAN_LIMITS } from '../ai.limits';
import { resolvePeriod } from '../ai.period';
import { aiQueries } from '../ai.queries';
import { defineReadTool, defineWriteTool } from '../ai.types';
import { formatBRL } from './tools.shared';

// A loja em si: visão geral, configurações, metas, categorias, produtos (preço, promoção, cadastro)
// e o que cada plano libera.

const MAX_MONEY = 99_999_999.99;
const MAX_STOCK = 1_000_000;
const money = z.number().min(0).max(MAX_MONEY);
const PAYMENT_LABEL: Record<string, string> = { pix: 'Pix', card: 'cartão', cash: 'dinheiro' };

async function getStoreOrThrow(userId: string): Promise<Store> {
  const store = await storeRepository.findByUserId(userId);
  if (!store) throw new NotFoundError('Você ainda não possui uma loja.');
  return store;
}

function requireFeature(
  store: Store,
  feature: keyof Pick<
    StorePlanLimits,
    'manualProductsEnabled' | 'categoriesEnabled' | 'promotionsEnabled'
  >,
  label: string,
): void {
  if (!STORE_PLAN_LIMITS[store.plan][feature]) {
    throw new PlanLimitError(
      `${label} não está disponível no plano ${STORE_PLAN_NAMES[store.plan]}. É preciso fazer upgrade para o Inicial ou superior (tela Planos).`,
    );
  }
}

// ---- Leitura ----------------------------------------------------------------------------------

export const homeOverviewTool = defineReadTool({
  name: 'get_home_overview',
  description:
    'O que a tela Início mostra: faturamento do mês com a variação sobre o mês anterior, progresso da meta mensal e os alertas (estoque baixo e vendas pendentes). Use para "como está meu mês", "como está minha meta".',
  input: z.object({}),
  async run(ctx) {
    const month = resolvePeriod({ period: 'this_month' });
    const home = await homeService.get(ctx.userId, {
      from: month.from,
      to: month.to,
      previousFrom: month.previous.from,
    });
    return {
      data: {
        month: month.label,
        revenue: home.revenue,
        goal: home.goal,
        lowStock: {
          threshold: home.alerts.lowStock.threshold,
          count: home.alerts.lowStock.count,
          products: home.alerts.lowStock.products,
        },
        pendingSalesCount: home.alerts.pendingSales.count,
      },
    };
  },
});

export const storeInfoTool = defineReadTool({
  name: 'get_store_info',
  description:
    'Dados e configurações da loja: nome, link da vitrine, se está online, descrição, formas de pagamento aceitas, estoque mínimo padrão, plano e uso do limite de produtos.',
  input: z.object({}),
  async run(ctx) {
    const [store, settings, planUsage] = await Promise.all([
      getStoreOrThrow(ctx.userId),
      storeService.getSettings(ctx.userId),
      storeService.getPlanUsage(ctx.userId),
    ]);
    return {
      data: {
        storeName: store.storeName,
        catalogLink: store.catalogLink,
        isOnline: store.isOnline,
        bio: store.bio,
        defaultMinStock: store.defaultMinStock,
        plan: settings.plan,
        acceptedPaymentMethods: settings.acceptedPaymentMethods.map(
          (method) => PAYMENT_LABEL[method] ?? method,
        ),
        hideOutOfStock: settings.hideOutOfStock,
        productLimit: planUsage.limits.maxProducts,
        productsUsed: planUsage.usage.products,
        frozenProducts: planUsage.usage.frozen,
      },
    };
  },
});

export const planFeaturesTool = defineReadTool({
  name: 'get_plan_features',
  description:
    'O que cada plano (Gratuito, Inicial, Pro) libera: limite de produtos, produto manual e kits, categorias, promoções, relatórios (mais vendidos; parados e marcas) e mensagens do assistente por mês. Indica qual é o plano atual. Use para "o que meu plano inclui", "vale a pena fazer upgrade". A troca de plano é feita na tela Planos do app.',
  input: z.object({}),
  async run(ctx) {
    const store = await getStoreOrThrow(ctx.userId);
    const plans = (Object.keys(STORE_PLAN_LIMITS) as StorePlan[]).map((id) => ({
      id,
      name: STORE_PLAN_NAMES[id],
      current: id === store.plan,
      maxProducts: STORE_PLAN_LIMITS[id].maxProducts ?? 'ilimitado',
      manualProductsAndKits: STORE_PLAN_LIMITS[id].manualProductsEnabled,
      categories: STORE_PLAN_LIMITS[id].categoriesEnabled,
      promotions: STORE_PLAN_LIMITS[id].promotionsEnabled,
      topProductsReport: STORE_PLAN_LIMITS[id].topProductsReportEnabled,
      staleAndBrandsReports: STORE_PLAN_LIMITS[id].advancedReportsEnabled,
      assistantMessagesPerMonth: AI_PLAN_LIMITS[id].messagesPerMonth,
    }));
    return { data: { currentPlan: STORE_PLAN_NAMES[store.plan], plans } };
  },
});

export const listCategoriesTool = defineReadTool({
  name: 'list_categories',
  description: 'Categorias de produtos da loja, com quantos produtos há em cada uma.',
  input: z.object({}),
  async run(ctx) {
    const categories = await storeService.listCategories(ctx.userId);
    return {
      data: {
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          products: category.productCount,
        })),
      },
    };
  },
});

// ---- Escrita ----------------------------------------------------------------------------------

const updateProductInput = z.object({
  storeProductId: z.string().uuid().describe('Id do produto na loja (de search_my_stock).'),
  price: money.optional().describe('Novo preço de venda.'),
  costPrice: money.nullable().optional().describe('Novo preço de custo (null limpa o custo).'),
  minStock: z.number().int().min(0).max(MAX_STOCK).optional().describe('Estoque mínimo do alerta.'),
  isActive: z.boolean().optional().describe('false esconde o produto da vitrine.'),
  categoryId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe('Categoria (de list_categories). null tira da categoria.'),
  promoPrice: money.optional().describe('Preço promocional (menor que o preço normal).'),
  promoDays: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe('Quantos dias a promoção dura. Obrigatório com promoPrice.'),
  clearPromo: z.boolean().optional().describe('true remove a promoção.'),
});

export const updateProductTool = defineWriteTool({
  name: 'propose_update_product',
  description:
    'Propõe alterar um produto que já está na loja: preço, custo, estoque mínimo, mostrar/esconder na vitrine, categoria ou promoção temporária. Para mudar a QUANTIDADE em estoque use propose_adjust_stock. NÃO executa: a usuária precisa confirmar.',
  input: updateProductInput,
  payloadSchema: updateProductInput
    .omit({ promoDays: true })
    .extend({ promoEndsAt: z.string().datetime().optional() }),
  async prepare(ctx, input) {
    const row = await aiQueries.findStockRow(ctx.storeId, input.storeProductId);
    if (!row) throw new NotFoundError('Produto não encontrado na sua loja.');

    const changes: string[] = [];
    const payload: Record<string, unknown> = { storeProductId: input.storeProductId };

    if (input.price !== undefined && input.price !== row.price) {
      changes.push(`preço de ${formatBRL(row.price)} para ${formatBRL(input.price)}`);
      payload.price = input.price;
    }
    if (input.costPrice !== undefined && input.costPrice !== row.costPrice) {
      changes.push(
        input.costPrice === null ? 'remover o custo' : `custo de ${formatBRL(input.costPrice)}`,
      );
      payload.costPrice = input.costPrice;
    }
    if (input.minStock !== undefined && input.minStock !== row.minStock) {
      changes.push(`estoque mínimo de ${row.minStock} para ${input.minStock}`);
      payload.minStock = input.minStock;
    }
    if (input.isActive !== undefined) {
      changes.push(input.isActive ? 'mostrar na vitrine' : 'esconder da vitrine');
      payload.isActive = input.isActive;
    }
    if (input.categoryId !== undefined) {
      changes.push(input.categoryId === null ? 'tirar da categoria' : 'trocar a categoria');
      payload.categoryId = input.categoryId;
    }

    if (input.clearPromo) {
      changes.push('remover a promoção');
      payload.clearPromo = true;
    } else if (input.promoPrice !== undefined) {
      if (!input.promoDays) {
        throw new AppError(
          'Informe por quantos dias a promoção vale (promoDays).',
          400,
          'MISSING_PROMO_DAYS',
        );
      }
      const store = await getStoreOrThrow(ctx.userId);
      requireFeature(store, 'promotionsEnabled', 'Preço promocional');
      const effectivePrice = (payload.price as number | undefined) ?? row.price;
      if (input.promoPrice >= effectivePrice) {
        throw new AppError(
          `O preço promocional (${formatBRL(input.promoPrice)}) precisa ser menor que o preço normal (${formatBRL(effectivePrice)}).`,
          400,
          'INVALID_PROMO_PRICE',
        );
      }
      changes.push(`promoção de ${formatBRL(input.promoPrice)} por ${input.promoDays} dia(s)`);
      payload.promoPrice = input.promoPrice;
      payload.promoEndsAt = new Date(
        Date.now() + input.promoDays * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    if (changes.length === 0) {
      throw new AppError(
        `Nada a mudar em "${row.name}": os valores já são esses.`,
        400,
        'NO_CHANGE',
      );
    }

    return {
      summary: `Alterar "${row.name}" (${row.brand}): ${changes.join('; ')}.`,
      preview: {
        storeProductId: row.storeProductId,
        name: row.name,
        brand: row.brand,
        image: row.image,
        changes,
      },
      payload,
    };
  },
  async apply(ctx, payload) {
    const updated = await storeService.updateProduct(ctx.userId, payload.storeProductId, {
      ...(payload.price !== undefined ? { price: payload.price } : {}),
      ...(payload.costPrice !== undefined ? { costPrice: payload.costPrice } : {}),
      ...(payload.minStock !== undefined ? { minStock: payload.minStock } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
      ...(payload.clearPromo ? { promoPrice: null, promoEndsAt: null } : {}),
      ...(payload.promoPrice !== undefined && payload.promoEndsAt !== undefined
        ? { promoPrice: payload.promoPrice, promoEndsAt: new Date(payload.promoEndsAt) }
        : {}),
    });
    return { storeProductId: updated.id, price: updated.price, isActive: updated.isActive };
  },
});

const removeProductInput = z.object({ storeProductId: z.string().uuid() });

export const removeProductTool = defineWriteTool({
  name: 'propose_remove_product',
  description:
    'Propõe REMOVER um produto da loja (apaga o produto e o estoque dele; as vendas antigas continuam no histórico). Não dá para desfazer. NÃO executa: a usuária precisa confirmar.',
  input: removeProductInput,
  async prepare(ctx, input) {
    const row = await aiQueries.findStockRow(ctx.storeId, input.storeProductId);
    if (!row) throw new NotFoundError('Produto não encontrado na sua loja.');
    return {
      summary: `Remover "${row.name}" (${row.brand}) da loja, com ${row.stock} unidade(s) em estoque. Não dá para desfazer.`,
      preview: {
        storeProductId: row.storeProductId,
        name: row.name,
        brand: row.brand,
        image: row.image,
        stock: row.stock,
      },
      payload: { storeProductId: input.storeProductId },
    };
  },
  async apply(ctx, payload) {
    await storeService.removeProduct(ctx.userId, payload.storeProductId);
    return { removed: true };
  },
});

const goalInput = z.object({
  monthlyGoal: z
    .number()
    .min(0.01)
    .max(9_999_999_999.99)
    .describe('Meta de faturamento do mês, em reais.'),
});

export const setGoalTool = defineWriteTool({
  name: 'propose_set_monthly_goal',
  description:
    'Propõe definir ou trocar a meta de faturamento mensal. NÃO executa: a usuária precisa confirmar.',
  input: goalInput,
  async prepare(_ctx, input) {
    return {
      summary: `Definir a meta de faturamento mensal em ${formatBRL(input.monthlyGoal)}.`,
      preview: { monthlyGoal: input.monthlyGoal },
      payload: input,
    };
  },
  async apply(ctx, payload) {
    return { monthlyGoal: await storeService.setMonthlyGoal(ctx.userId, payload.monthlyGoal) };
  },
});

const updateStoreInput = z.object({
  isOnline: z.boolean().optional().describe('Liga ou desliga a vitrine online.'),
  storeName: z.string().trim().min(2).max(120).optional(),
  bio: z.string().trim().max(280).nullable().optional().describe('Descrição da loja (null limpa).'),
});

export const updateStoreTool = defineWriteTool({
  name: 'propose_update_store',
  description:
    'Propõe mudar a loja: ligar/desligar a vitrine online, nome ou descrição. O link (endereço) da vitrine não pode ser mudado por aqui. NÃO executa: a usuária precisa confirmar.',
  input: updateStoreInput,
  async prepare(ctx, input) {
    const store = await getStoreOrThrow(ctx.userId);
    const changes: string[] = [];
    if (input.isOnline !== undefined && input.isOnline !== store.isOnline) {
      changes.push(input.isOnline ? 'ligar a vitrine online' : 'desligar a vitrine online');
    }
    if (input.storeName !== undefined && input.storeName !== store.storeName) {
      changes.push(`nome para "${input.storeName}"`);
    }
    if (input.bio !== undefined && (input.bio || null) !== store.bio) {
      changes.push(input.bio ? 'atualizar a descrição' : 'apagar a descrição');
    }
    if (changes.length === 0) {
      throw new AppError('Nada a mudar: a loja já está assim.', 400, 'NO_CHANGE');
    }
    return { summary: `Loja: ${changes.join('; ')}.`, preview: { changes }, payload: input };
  },
  async apply(ctx, payload) {
    const store = await storeService.updateStore(ctx.userId, payload);
    return { storeName: store.storeName, isOnline: store.isOnline };
  },
});

const updateSettingsInput = z.object({
  acceptedPaymentMethods: z
    .array(z.enum(['pix', 'card', 'cash']))
    .min(1)
    .optional()
    .describe('Formas de pagamento que a vitrine aceita.'),
  hideOutOfStock: z.boolean().optional().describe('Esconder da vitrine o produto sem estoque.'),
});

export const updateSettingsTool = defineWriteTool({
  name: 'propose_update_store_settings',
  description:
    'Propõe mudar as formas de pagamento aceitas na vitrine (pix, card, cash) e/ou esconder produtos sem estoque. NÃO executa: a usuária precisa confirmar.',
  input: updateSettingsInput,
  async prepare(_ctx, input) {
    const changes: string[] = [];
    if (input.acceptedPaymentMethods) {
      changes.push(
        `formas de pagamento: ${input.acceptedPaymentMethods.map((method) => PAYMENT_LABEL[method]).join(', ')}`,
      );
    }
    if (input.hideOutOfStock !== undefined) {
      changes.push(
        input.hideOutOfStock ? 'esconder produtos sem estoque' : 'mostrar produtos sem estoque',
      );
    }
    if (changes.length === 0) {
      throw new AppError('Informe o que mudar nas configurações.', 400, 'NO_CHANGE');
    }
    return {
      summary: `Configurações da vitrine: ${changes.join('; ')}.`,
      preview: { changes },
      payload: input,
    };
  },
  async apply(ctx, payload) {
    const settings = await storeService.updateSettings(ctx.userId, payload);
    return {
      acceptedPaymentMethods: settings.acceptedPaymentMethods,
      hideOutOfStock: settings.hideOutOfStock,
    };
  },
});

const createCategoryInput = z.object({ name: z.string().trim().min(1).max(40) });

export const createCategoryTool = defineWriteTool({
  name: 'propose_create_category',
  description:
    'Propõe criar uma categoria de produtos (plano Inicial ou superior). NÃO executa: a usuária precisa confirmar.',
  input: createCategoryInput,
  async prepare(ctx, input) {
    requireFeature(await getStoreOrThrow(ctx.userId), 'categoriesEnabled', 'Categorias');
    return {
      summary: `Criar a categoria "${input.name}".`,
      preview: { name: input.name },
      payload: input,
    };
  },
  async apply(ctx, payload) {
    const category = await storeService.createCategory(ctx.userId, payload.name);
    return { categoryId: category.id, name: category.name };
  },
});

const manualProductInput = z.object({
  name: z.string().trim().min(2).max(120),
  price: money,
  costPrice: money.optional(),
  stock: z.number().int().min(0).max(MAX_STOCK).describe('Unidades em estoque.'),
  description: z.string().trim().max(500).optional(),
});

export const createManualProductTool = defineWriteTool({
  name: 'propose_create_manual_product',
  description:
    'Propõe cadastrar um produto PRÓPRIO, fora do catálogo (ex.: um ursinho ou uma cesta), sem foto — a foto a usuária coloca depois no app. Plano Inicial ou superior. Para produto do catálogo use propose_add_to_stock. NÃO executa: a usuária precisa confirmar.',
  input: manualProductInput,
  async prepare(ctx, input) {
    requireFeature(
      await getStoreOrThrow(ctx.userId),
      'manualProductsEnabled',
      'Cadastro de produto próprio',
    );
    return {
      summary: `Cadastrar o produto próprio "${input.name}": ${input.stock} unidade(s), preço ${formatBRL(input.price)}.`,
      preview: { name: input.name, price: input.price, stock: input.stock },
      payload: input,
    };
  },
  async apply(ctx, payload) {
    const product = await storeService.addManualProduct(ctx.userId, {
      name: payload.name,
      price: payload.price,
      costPrice: payload.costPrice ?? null,
      stock: payload.stock,
      description: payload.description ?? null,
    });
    return { storeProductId: product.id, stock: product.stock };
  },
});

export const STORE_TOOLS = [
  homeOverviewTool,
  storeInfoTool,
  planFeaturesTool,
  listCategoriesTool,
  updateProductTool,
  removeProductTool,
  setGoalTool,
  updateStoreTool,
  updateSettingsTool,
  createCategoryTool,
  createManualProductTool,
];
