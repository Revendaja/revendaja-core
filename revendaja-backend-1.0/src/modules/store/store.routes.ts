import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import {
  addStoreProductSchema,
  createManualStoreProductSchema,
  createStoreCategorySchema,
  createStoreSchema,
  listStoreProductsQuerySchema,
  monthlyGoalResponseSchema,
  paginatedStoreProductsResponseSchema,
  setMonthlyGoalSchema,
  storeCategoriesResponseSchema,
  storeCategoryParamsSchema,
  storeCategoryResponseSchema,
  storeProductParamsSchema,
  storeProductResponseSchema,
  storeResponseSchema,
  storePlanUsageResponseSchema,
  storeSettingsResponseSchema,
  updateStoreProductSchema,
  updateStoreSchema,
  updateStoreSettingsSchema,
} from './store.schema';
import {
  addManualStoreProduct,
  addStoreProduct,
  createStore,
  createStoreCategory,
  getStorePlan,
  getStoreProduct,
  getStoreSettings,
  listStoreCategories,
  listStoreProducts,
  removeStoreCategory,
  removeStoreProduct,
  setMonthlyGoal,
  updateStore,
  updateStoreProduct,
  updateStoreSettings,
} from './store.controller';

export async function storeRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/store',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de criar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Cria a loja da usuária autenticada (uma por conta).',
        security: [{ bearerAuth: [] }],
        body: createStoreSchema,
        response: { 201: storeResponseSchema },
      },
    },
    createStore,
  );

  server.patch(
    '/store',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary:
          'Liga/desliga a vitrine (Minha Loja) e edita nome, link (handle) e descrição (Editar Loja). Só muda o que vier. Trocar o handle troca o link da vitrine (409 HANDLE_UNAVAILABLE se já estiver em uso). Devolve a loja atualizada.',
        security: [{ bearerAuth: [] }],
        body: updateStoreSchema,
        response: { 200: storeResponseSchema },
      },
    },
    updateStore,
  );

  server.put(
    '/store/goal',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary:
          'Define (ou troca) a meta de faturamento mensal, escolhida pela loja no início (card "Meta de Vendas" da Home).',
        security: [{ bearerAuth: [] }],
        body: setMonthlyGoalSchema,
        response: { 200: monthlyGoalResponseSchema },
      },
    },
    setMonthlyGoal,
  );

  server.get(
    '/store/settings',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary:
          'Plano da loja e as configurações da tela Mais: formas de pagamento aceitas e ocultar produtos sem estoque.',
        security: [{ bearerAuth: [] }],
        response: { 200: storeSettingsResponseSchema },
      },
    },
    getStoreSettings,
  );

  server.get(
    '/store/plan',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary:
          'Plano da loja com os limites (máx. de produtos, cadastro manual, categorias, promoções) e o uso atual (produtos cadastrados).',
        security: [{ bearerAuth: [] }],
        response: { 200: storePlanUsageResponseSchema },
      },
    },
    getStorePlan,
  );

  server.patch(
    '/store/settings',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary:
          'Altera as formas de pagamento aceitas (ao menos uma, sem fiado) e/ou ocultar produtos sem estoque. Só muda o que vier.',
        security: [{ bearerAuth: [] }],
        body: updateStoreSettingsSchema,
        response: { 200: storeSettingsResponseSchema },
      },
    },
    updateStoreSettings,
  );

  server.post(
    '/store/products',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Importa um produto do catálogo global pra loja, com preço próprio.',
        security: [{ bearerAuth: [] }],
        body: addStoreProductSchema,
        response: { 201: storeProductResponseSchema },
      },
    },
    addStoreProduct,
  );

  server.post(
    '/store/products/manual',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary:
          'Cadastra um produto exclusivo da loja (fora do catálogo, ex.: um ursinho ou uma cesta de presente). ' +
          '`components` (opcional) monta um "kit": cada produto listado ali tem o estoque debitado junto quando este for vendido.',
        security: [{ bearerAuth: [] }],
        body: createManualStoreProductSchema,
        response: { 201: storeProductResponseSchema },
      },
    },
    addManualStoreProduct,
  );

  // Estáticas, registradas antes de `/store/products/:id`: "categories" nunca deve ser lido como um id.
  server.get(
    '/store/products/categories',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Lista as categorias que a própria loja criou, com quantos produtos tem em cada uma.',
        security: [{ bearerAuth: [] }],
        response: { 200: storeCategoriesResponseSchema },
      },
    },
    listStoreCategories,
  );

  server.post(
    '/store/products/categories',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Cria uma categoria própria da loja (409 se já existir uma com o mesmo nome).',
        security: [{ bearerAuth: [] }],
        body: createStoreCategorySchema,
        response: { 201: storeCategoryResponseSchema },
      },
    },
    createStoreCategory,
  );

  server.delete(
    '/store/products/categories/:id',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Apaga uma categoria da loja. Os produtos que estavam nela ficam sem categoria.',
        security: [{ bearerAuth: [] }],
        params: storeCategoryParamsSchema,
      },
    },
    removeStoreCategory,
  );

  server.get(
    '/store/products',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Lista os produtos que a loja importou do catálogo.',
        security: [{ bearerAuth: [] }],
        querystring: listStoreProductsQuerySchema,
        response: { 200: paginatedStoreProductsResponseSchema },
      },
    },
    listStoreProducts,
  );

  server.get(
    '/store/products/:id',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Busca um produto específico da loja (404 se não for da loja autenticada).',
        security: [{ bearerAuth: [] }],
        params: storeProductParamsSchema,
        response: { 200: storeProductResponseSchema },
      },
    },
    getStoreProduct,
  );

  server.patch(
    '/store/products/:id',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Edita o preço e/ou a visibilidade de um produto da loja.',
        security: [{ bearerAuth: [] }],
        params: storeProductParamsSchema,
        body: updateStoreProductSchema,
        response: { 200: storeProductResponseSchema },
      },
    },
    updateStoreProduct,
  );

  server.delete(
    '/store/products/:id',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['store'],
        summary: 'Remove um produto da loja (não afeta o catálogo global nem outras lojas).',
        security: [{ bearerAuth: [] }],
        params: storeProductParamsSchema,
      },
    },
    removeStoreProduct,
  );
}
