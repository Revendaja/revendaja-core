import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { AUTH_RATE_LIMITS } from '../../shared/rateLimits';
import { deleteAccountResponseSchema, deleteAccountSchema } from './account.schema';
import { deleteAccount } from './account.controller';

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.delete(
    '/me',
    {
      preHandler: authenticate,
      // Mesmo limite do login: a senha pedida aqui também é alvo de tentativa e erro.
      config: { rateLimit: AUTH_RATE_LIMITS.login },
      schema: {
        tags: ['auth'],
        summary:
          'Exclui a conta da usuária autenticada e tudo que é dela (loja, produtos, vendas, ' +
          'conversas, imagens). Cancela a assinatura na Stripe antes. Exige a senha, ou um ID ' +
          'token do Google para conta sem senha. Não tem volta.',
        security: [{ bearerAuth: [] }],
        body: deleteAccountSchema,
        response: { 200: deleteAccountResponseSchema },
      },
    },
    deleteAccount,
  );
}
