import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import {
  createSaleSchema,
  listSalesQuerySchema,
  paginatedSalesResponseSchema,
  saleParamsSchema,
  saleResponseSchema,
  salesSummaryQuerySchema,
  salesSummaryResponseSchema,
  salesTimelineQuerySchema,
  salesTimelineResponseSchema,
  staleProductsQuerySchema,
  staleProductsResponseSchema,
  topBrandsQuerySchema,
  topBrandsResponseSchema,
  topProductsQuerySchema,
  topProductsResponseSchema,
  updateSaleStatusSchema,
} from './sales.schema';
import {
  createSale,
  getSale,
  getSalesSummary,
  getSalesTimeline,
  getStaleProducts,
  getTopBrands,
  getTopProducts,
  listSales,
  updateSaleStatus,
} from './sales.controller';

const VERIFIED = requireVerified('Confirme seu e-mail antes de gerenciar a loja.');

export async function salesRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/sales',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Registra uma venda: baixa o estoque, grava o preço/custo do momento e numera (Venda #N). Idempotente por clientRequestId.',
        security: [{ bearerAuth: [] }],
        body: createSaleSchema,
        response: { 200: saleResponseSchema, 201: saleResponseSchema },
      },
    },
    createSale,
  );

  // Registrada antes de `/sales/:id` (rota estática tem precedência, mas deixa a
  // intenção explícita).
  server.get(
    '/sales/summary',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Resumo financeiro do período (from inclusivo, to exclusivo): faturamento, a receber, lucro e margem.',
        security: [{ bearerAuth: [] }],
        querystring: salesSummaryQuerySchema,
        response: { 200: salesSummaryResponseSchema },
      },
    },
    getSalesSummary,
  );

  server.get(
    '/sales/timeline',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Receita (vendas pagas) e custo por dia, semana ou mês no período (from inclusivo, to exclusivo), com os períodos sem venda zerados. Alimenta o gráfico do painel.',
        security: [{ bearerAuth: [] }],
        querystring: salesTimelineQuerySchema,
        response: { 200: salesTimelineResponseSchema },
      },
    },
    getSalesTimeline,
  );

  // Também estáticas, registradas antes de `/sales/:id` pela mesma razão de `/sales/summary`.
  server.get(
    '/sales/top-products',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Produtos mais vendidos no período (from inclusivo, to exclusivo), por quantidade — só vendas pagas.',
        security: [{ bearerAuth: [] }],
        querystring: topProductsQuerySchema,
        response: { 200: topProductsResponseSchema },
      },
    },
    getTopProducts,
  );

  server.get(
    '/sales/top-brands',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Marcas mais vendidas no período (from inclusivo, to exclusivo), por quantidade — só vendas pagas de produtos do catálogo (produto manual não tem marca).',
        security: [{ bearerAuth: [] }],
        querystring: topBrandsQuerySchema,
        response: { 200: topBrandsResponseSchema },
      },
    },
    getTopBrands,
  );

  server.get(
    '/sales/stale-products',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Produtos com estoque (> 0) sem nenhuma venda paga nos últimos `days` dias, os com mais estoque parado primeiro.',
        security: [{ bearerAuth: [] }],
        querystring: staleProductsQuerySchema,
        response: { 200: staleProductsResponseSchema },
      },
    },
    getStaleProducts,
  );

  server.get(
    '/sales',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Lista as vendas da loja (mais recente primeiro), com filtro opcional de período e status.',
        security: [{ bearerAuth: [] }],
        querystring: listSalesQuerySchema,
        response: { 200: paginatedSalesResponseSchema },
      },
    },
    listSales,
  );

  server.get(
    '/sales/:id',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary: 'Detalha uma venda, com os itens gravados no momento da venda.',
        security: [{ bearerAuth: [] }],
        params: saleParamsSchema,
        response: { 200: saleResponseSchema },
      },
    },
    getSale,
  );

  server.patch(
    '/sales/:id',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['sales'],
        summary:
          'Altera o status de uma venda PENDENTE: "paid" (a loja recebeu) ou "cancelled" (cancela e devolve o estoque reservado). Idempotente; venda paga não cancela.',
        security: [{ bearerAuth: [] }],
        params: saleParamsSchema,
        body: updateSaleStatusSchema,
        response: { 200: saleResponseSchema },
      },
    },
    updateSaleStatus,
  );
}
