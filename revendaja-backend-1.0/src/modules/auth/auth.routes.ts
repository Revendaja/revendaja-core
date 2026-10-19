import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { AUTH_RATE_LIMITS } from '../../shared/rateLimits';
import { userPublicSchema } from '../users/users.schema';
import {
  authResponseSchema,
  googleLoginSchema,
  loginSchema,
  logoutResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from './auth.schema';
import { login, loginWithGoogle, logout, me, refresh, register, updateProfile } from './auth.controller';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/auth/register',
    {
      config: { rateLimit: AUTH_RATE_LIMITS.register },
      schema: {
        tags: ['auth'],
        summary: 'Cria a conta e envia um código de verificação por e-mail.',
        body: registerSchema,
        response: { 201: authResponseSchema },
      },
    },
    register,
  );

  server.post(
    '/auth/login',
    {
      config: { rateLimit: AUTH_RATE_LIMITS.login },
      schema: {
        tags: ['auth'],
        summary:
          'Autentica com e-mail e senha. Sessão única: encerra a sessão ativa em outro aparelho.',
        body: loginSchema,
        response: { 200: authResponseSchema },
      },
    },
    login,
  );

  server.post(
    '/auth/google',
    {
      config: { rateLimit: AUTH_RATE_LIMITS.login },
      schema: {
        tags: ['auth'],
        summary:
          'Autentica (ou cria a conta, se for a primeira vez) com um ID token do Google. ' +
          'E-mail já chega verificado; `needsWhatsapp` indica se falta completar o cadastro.',
        body: googleLoginSchema,
        response: { 200: authResponseSchema },
      },
    },
    loginWithGoogle,
  );

  // Público de propósito: quando o access token expirou (15 min) ele não serve
  // mais como credencial — quem autentica aqui é o próprio refresh token.
  server.post(
    '/auth/refresh',
    {
      config: { rateLimit: AUTH_RATE_LIMITS.refresh },
      schema: {
        tags: ['auth'],
        summary:
          'Troca o refresh token por um novo access token (mesma sessão). 401 = fazer login de novo.',
        body: refreshSchema,
        response: { 200: refreshResponseSchema },
      },
    },
    refresh,
  );

  server.post(
    '/auth/logout',
    {
      preHandler: authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Encerra a sessão atual (os tokens deixam de valer).',
        security: [{ bearerAuth: [] }],
        response: { 200: logoutResponseSchema },
      },
    },
    logout,
  );

  // Fora do prefixo /auth de propósito — é o endpoint que o app chama ao
  // reabrir para saber em que ponto do onboarding a usuária está.
  server.get(
    '/me',
    {
      preHandler: authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Retorna o usuário autenticado, status de verificação e loja (se houver).',
        security: [{ bearerAuth: [] }],
        response: { 200: meResponseSchema },
      },
    },
    me,
  );

  server.patch(
    '/me',
    {
      preHandler: authenticate,
      schema: {
        tags: ['auth'],
        summary:
          'Atualiza nome e/ou WhatsApp da usuária autenticada ("Meus Dados"). Só grava o que veio. ' +
          'O e-mail não é editável por aqui (mudar de e-mail exigiria reverificar a conta). ' +
          '409 se o WhatsApp já for de outra conta.',
        security: [{ bearerAuth: [] }],
        body: updateProfileSchema,
        response: { 200: userPublicSchema },
      },
    },
    updateProfile,
  );
}
