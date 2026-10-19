import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import {
  catalogBrandResponseSchema,
  catalogProductParamsSchema,
  catalogProductResponseSchema,
  listCatalogProductsQuerySchema,
  paginatedCatalogProductsResponseSchema,
} from './catalog.schema';
import { getProduct, listBrands, listProducts } from './catalog.controller';

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/catalog/brands',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['catalog'],
        summary: 'Lista as marcas disponíveis no catálogo global.',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(catalogBrandResponseSchema) },
      },
    },
    listBrands,
  );

  server.get(
    '/catalog/products',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['catalog'],
        summary:
          'Lista produtos do catálogo global, com busca por nome ou código de barras (8 a 14 dígitos) e filtro por marca.',
        security: [{ bearerAuth: [] }],
        querystring: listCatalogProductsQuerySchema,
        response: { 200: paginatedCatalogProductsResponseSchema },
      },
    },
    listProducts,
  );

  server.get(
    '/catalog/products/:id',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['catalog'],
        summary: 'Detalha um produto do catálogo global.',
        security: [{ bearerAuth: [] }],
        params: catalogProductParamsSchema,
        response: { 200: catalogProductResponseSchema },
      },
    },
    getProduct,
  );
}
