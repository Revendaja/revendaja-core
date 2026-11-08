import { request } from './http';
import type { StorePlanId } from './types';

// Assistente de IA (POST /ai/chat). A IA só PROPÕE alterações: elas ficam como "ação pendente" e
// só são executadas depois do confirmar (confirmAiAction). Mesmo contrato do app mobile.

export type AiCard =
  | {
      type: 'catalog_product';
      productId: number;
      name: string;
      brand: string;
      image: string | null;
      price: number;
      // Preenchido quando o produto já está na loja.
      storeProductId: string | null;
    }
  | {
      type: 'stock_product';
      storeProductId: string;
      name: string;
      brand: string;
      image: string | null;
      stock: number;
      minStock: number;
      price: number;
      costPrice: number | null;
    };

export type AiActionStatus = 'pending' | 'executing' | 'executed' | 'failed' | 'cancelled' | 'expired';

export type AiAction = {
  id: string;
  tool: string;
  // Texto pronto, em português, descrevendo o que vai acontecer.
  summary: string;
  preview: ({ name?: string; brand?: string; image?: string | null } & Record<string, unknown>) | null;
  status: AiActionStatus;
  error: string | null;
  expiresAt: string;
};

export type AiChatResponse = {
  conversationId: string;
  message: string;
  cards: AiCard[];
  pendingActions: AiAction[];
};

// A resposta do modelo (com consultas ao banco no meio) leva bem mais que uma chamada comum.
const CHAT_TIMEOUT_MS = 90_000;

export function sendAiMessage(input: { conversationId?: string | null; message: string }) {
  return request<AiChatResponse>('/ai/chat', {
    method: 'POST',
    auth: true,
    timeoutMs: CHAT_TIMEOUT_MS,
    body: { message: input.message, ...(input.conversationId ? { conversationId: input.conversationId } : {}) },
  });
}

// Idempotente no servidor: confirmar de novo uma operação já executada devolve o resultado.
export function confirmAiAction(id: string) {
  return request<AiAction>(`/ai/actions/${id}/confirm`, { method: 'POST', auth: true });
}

export function cancelAiAction(id: string) {
  return request<AiAction>(`/ai/actions/${id}/cancel`, { method: 'POST', auth: true });
}

export type AiUsage = {
  plan: { id: StorePlanId; name: string };
  messages: { used: number; limit: number; remaining: number };
  // Quando o limite volta a zerar (início do próximo mês).
  resetsAt: string;
  maxMessageChars: number;
  maxAudioSeconds: number;
};

export function getAiUsage() {
  return request<AiUsage>('/ai/usage', { auth: true });
}
