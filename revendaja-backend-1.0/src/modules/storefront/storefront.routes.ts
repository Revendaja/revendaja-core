import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import {
  onlineOrderResponseSchema,
  onlineOrderSchema,
  storefrontCustomizationResponseSchema,
  storefrontHomeResponseSchema,
  storefrontParamsSchema,
  storefrontQuerySchema,
  storefrontResponseSchema,
  storeStatsResponseSchema,
} from './storefront.schema';
import { updateStorefrontConfigSchema } from './storefront.config';
import {
  createOnlineOrder,
  getStorefront,
  getStorefrontCustomization,
  getStorefrontHome,
  getStoreStats,
  recordVisit,
  updateStorefrontCustomization,
} from './storefront.controller';

// Limites por IP das rotas públicas (o plugin responde 429 acima disso). Uma pessoa de verdade
// navega, abre a vitrine uma vez e faz poucos pedidos; um robô passa desses números de longe.
// Pedidos têm o limite mais apertado porque cada um reserva estoque. Atrás de um proxy, configure
// TRUST_PROXY, senão todos os clientes dividem um único IP (e um único limite).
const RATE_LIMITS = {
  browse: { max: 120, timeWindow: '1 minute' },
  visit: { max: 30, timeWindow: '1 minute' },
  order: { max: 10, timeWindow: '1 hour' },
};

export async function storefrontRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // --- Rotas PÚBLICAS (sem login), usadas pelo revendaja-web -----------------
  // Loja inexistente ou desativada respondem 404 com `error` = STORE_NOT_FOUND ou STORE_OFFLINE.

  server.get(
    '/public/stores/:handle',
    {
      config: { rateLimit: RATE_LIMITS.browse },
      schema: {
        tags: ['storefront'],
        summary:
          'Vitrine pública: nome da loja, formas de pagamento aceitas e os produtos visíveis (com preço).',
        params: storefrontParamsSchema,
        querystring: storefrontQuerySchema,
        response: { 200: storefrontResponseSchema },
      },
    },
    getStorefront,
  );

  server.get(
    '/public/stores/:handle/home',
    {
      config: { rateLimit: RATE_LIMITS.browse },
      schema: {
        tags: ['storefront'],
        summary:
          'Página inicial da vitrine: banners e textos (padrão ou personalizados pela loja), atalhos de categoria (do que a loja vende) e as seções de mais vendidos, ofertas e novidades.',
        params: storefrontParamsSchema,
        response: { 200: storefrontHomeResponseSchema },
      },
    },
    getStorefrontHome,
  );

  server.post(
    '/public/stores/:handle/visits',
    {
      config: { rateLimit: RATE_LIMITS.visit },
      schema: {
        tags: ['storefront'],
        summary:
          'Registra uma visita à vitrine (o site chama uma vez ao abrir). 204 sem corpo; conta nas estatísticas da loja.',
        params: storefrontParamsSchema,
      },
    },
    recordVisit,
  );

  server.post(
    '/public/stores/:handle/orders',
    {
      config: { rateLimit: RATE_LIMITS.order },
      schema: {
        tags: ['storefront'],
        summary:
          'Cria o pedido do cliente: vira uma venda PENDENTE da loja online. Idempotente por clientRequestId (201 novo, 200 repetido).',
        params: storefrontParamsSchema,
        body: onlineOrderSchema,
        response: { 200: onlineOrderResponseSchema, 201: onlineOrderResponseSchema },
      },
    },
    createOnlineOrder,
  );

  // --- Rota da loja (app), autenticada ---------------------------------------

  server.get(
    '/store/stats',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['storefront'],
        summary:
          'Estatísticas da tela Minha Loja: visitas nos últimos 7 dias e total de pedidos feitos pela vitrine.',
        security: [{ bearerAuth: [] }],
        response: { 200: storeStatsResponseSchema },
      },
    },
    getStoreStats,
  );
  server.get(
    '/store/storefront',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['storefront'],
        summary:
          'Aparência da vitrine: o que está valendo (padrão + personalizações), os padrões e quais seções a loja personalizou.',
        security: [{ bearerAuth: [] }],
        response: { 200: storefrontCustomizationResponseSchema },
      },
    },
    getStorefrontCustomization,
  );

  server.put(
    '/store/storefront',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['storefront'],
        summary:
          'Personaliza a vitrine. Só as seções enviadas mudam: preenchida = personalizada; null = volta ao padrão.',
        security: [{ bearerAuth: [] }],
        body: updateStorefrontConfigSchema,
        response: { 200: storefrontCustomizationResponseSchema },
      },
    },
    updateStorefrontCustomization,
  );
}
