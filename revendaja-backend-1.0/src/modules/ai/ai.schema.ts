import { z } from 'zod';
import { MAX_AI_MESSAGE_CHARS } from './ai.limits';

export const chatBodySchema = z.object({
  // Ausente = abre uma conversa nova.
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(MAX_AI_MESSAGE_CHARS),
});

export const conversationParamsSchema = z.object({ id: z.string().uuid() });
export const actionParamsSchema = z.object({ id: z.string().uuid() });

const cardSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('catalog_product'),
    productId: z.number().int(),
    name: z.string(),
    brand: z.string(),
    image: z.string().nullable(),
    price: z.number(),
    storeProductId: z.string().uuid().nullable(),
  }),
  z.object({
    type: z.literal('stock_product'),
    storeProductId: z.string().uuid(),
    name: z.string(),
    brand: z.string(),
    image: z.string().nullable(),
    stock: z.number().int(),
    minStock: z.number().int(),
    price: z.number(),
    costPrice: z.number().nullable(),
  }),
]);

export const actionResponseSchema = z.object({
  id: z.string().uuid(),
  tool: z.string(),
  summary: z.string(),
  preview: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(['pending', 'executing', 'executed', 'failed', 'cancelled', 'expired']),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  expiresAt: z.date(),
});

export const chatResponseSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string(),
  cards: z.array(cardSchema),
  pendingActions: z.array(actionResponseSchema),
});

export const conversationsResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().nullable(),
      updatedAt: z.date(),
    }),
  ),
});

export const conversationMessagesResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      // `notice`: aviso automático do app (operação confirmada/cancelada), não fala da usuária.
      role: z.enum(['user', 'assistant', 'notice']),
      text: z.string(),
      createdAt: z.date(),
    }),
  ),
  pendingActions: z.array(actionResponseSchema),
});

export type ChatBody = z.infer<typeof chatBodySchema>;
export type ConversationParams = z.infer<typeof conversationParamsSchema>;
export type ActionParams = z.infer<typeof actionParamsSchema>;

export const transcriptionResponseSchema = z.object({ text: z.string() });

const usageCounterSchema = z.object({
  used: z.number().int(),
  limit: z.number().int(),
  remaining: z.number().int(),
});

export const usageResponseSchema = z.object({
  plan: z.object({ id: z.enum(['free', 'starter', 'premium', 'business']), name: z.string() }),
  messages: usageCounterSchema,
  // Quando o limite volta a zerar (início do próximo mês).
  resetsAt: z.date(),
  maxMessageChars: z.number().int(),
  maxAudioSeconds: z.number().int(),
});
