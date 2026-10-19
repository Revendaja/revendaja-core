import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import { homeQuerySchema, homeResponseSchema } from './home.schema';
import { getHome } from './home.controller';

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/home',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de gerenciar a loja.')],
      schema: {
        tags: ['home'],
        summary:
          'Tudo da tela Início numa chamada: faturamento e lucro do período, crescimento sobre o período anterior, meta de vendas e alertas (estoque baixo e vendas pendentes).',
        security: [{ bearerAuth: [] }],
        querystring: homeQuerySchema,
        response: { 200: homeResponseSchema },
      },
    },
    getHome,
  );
}
