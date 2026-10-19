import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { AUTH_RATE_LIMITS } from '../../shared/rateLimits';
import {
  forgotPasswordResponseSchema,
  forgotPasswordSchema,
  resetPasswordResponseSchema,
  resetPasswordSchema,
} from './passwordReset.schema';
import { forgotPassword, resetPassword } from './passwordReset.controller';

export async function passwordResetRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/auth/forgot-password',
    {
      config: { rateLimit: AUTH_RATE_LIMITS.forgotPassword },
      schema: {
        tags: ['auth'],
        summary:
          'Envia por e-mail um código de 6 dígitos para redefinir a senha. Responde sempre igual, exista ou não a conta.',
        body: forgotPasswordSchema,
        response: { 200: forgotPasswordResponseSchema },
      },
    },
    forgotPassword,
  );

  server.post(
    '/auth/reset-password',
    {
      config: { rateLimit: AUTH_RATE_LIMITS.resetPassword },
      schema: {
        tags: ['auth'],
        summary:
          'Define a nova senha com o código de 6 dígitos recebido por e-mail (uso único, poucas tentativas) e encerra a sessão.',
        body: resetPasswordSchema,
        response: { 200: resetPasswordResponseSchema },
      },
    },
    resetPassword,
  );
}
