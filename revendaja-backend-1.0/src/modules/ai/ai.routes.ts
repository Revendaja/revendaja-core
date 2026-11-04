import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import {
  actionParamsSchema,
  actionResponseSchema,
  chatBodySchema,
  chatResponseSchema,
  conversationMessagesResponseSchema,
  conversationParamsSchema,
  conversationsResponseSchema,
  transcriptionResponseSchema,
  usageResponseSchema,
} from './ai.schema';
import {
  cancelAction,
  chat,
  confirmAction,
  getConversationMessages,
  getUsage,
  listConversations,
  transcribe,
} from './ai.controller';

const VERIFIED = requireVerified('Confirme seu e-mail antes de usar o assistente.');

// Cada mensagem pode custar uma chamada paga ao modelo: limite por IP como segunda camada.
const CHAT_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [authenticate, VERIFIED];

  server.post(
    '/ai/chat',
    {
      preHandler,
      config: { rateLimit: CHAT_RATE_LIMIT },
      schema: {
        tags: ['ai'],
        summary:
          'Envia uma mensagem ao assistente de IA. Devolve a resposta, cartões de produto e as operações que aguardam confirmação (nada é alterado até POST /ai/actions/:id/confirm).',
        security: [{ bearerAuth: [] }],
        body: chatBodySchema,
        response: { 200: chatResponseSchema },
      },
    },
    chat,
  );

  server.get(
    '/ai/conversations',
    {
      preHandler,
      schema: {
        tags: ['ai'],
        summary: 'Conversas recentes da loja com o assistente.',
        security: [{ bearerAuth: [] }],
        response: { 200: conversationsResponseSchema },
      },
    },
    listConversations,
  );

  server.get(
    '/ai/conversations/:id/messages',
    {
      preHandler,
      schema: {
        tags: ['ai'],
        summary: 'Mensagens de uma conversa e as operações ainda aguardando confirmação.',
        security: [{ bearerAuth: [] }],
        params: conversationParamsSchema,
        response: { 200: conversationMessagesResponseSchema },
      },
    },
    getConversationMessages,
  );

  server.post(
    '/ai/actions/:id/confirm',
    {
      preHandler,
      config: { rateLimit: CHAT_RATE_LIMIT },
      schema: {
        tags: ['ai'],
        summary:
          'Confirma e executa uma operação proposta pela IA. Idempotente: confirmar de novo devolve o resultado, sem executar outra vez.',
        security: [{ bearerAuth: [] }],
        params: actionParamsSchema,
        response: { 200: actionResponseSchema },
      },
    },
    confirmAction,
  );

  server.post(
    '/ai/actions/:id/cancel',
    {
      preHandler,
      schema: {
        tags: ['ai'],
        summary: 'Cancela uma operação proposta pela IA que ainda não foi executada.',
        security: [{ bearerAuth: [] }],
        params: actionParamsSchema,
        response: { 200: actionResponseSchema },
      },
    },
    cancelAction,
  );

  server.get(
    '/ai/usage',
    {
      preHandler,
      schema: {
        tags: ['ai'],
        summary: 'Quantas mensagens do assistente a loja já usou no mês e o limite do plano.',
        security: [{ bearerAuth: [] }],
        response: { 200: usageResponseSchema },
      },
    },
    getUsage,
  );

  server.post(
    '/ai/transcribe',
    {
      preHandler,
      config: { rateLimit: CHAT_RATE_LIMIT },
      schema: {
        tags: ['ai'],
        summary:
          'Transforma um áudio (multipart, campo "audio", até 5 MB) em texto para a mensagem por voz. Consome uma transcrição do limite do plano.',
        security: [{ bearerAuth: [] }],
        response: { 200: transcriptionResponseSchema },
      },
    },
    transcribe,
  );
}
