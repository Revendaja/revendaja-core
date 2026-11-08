import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from './config';
import { ApiError, NetworkError } from './errors';
import { getFreshAccessToken, request } from './http';

// Assistente de IA (POST /ai/chat). A IA só PROPÕE alterações: elas ficam como "ação pendente" e
// só são executadas depois do confirmar (confirmAiAction).

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
  preview: { name?: string; brand?: string; image?: string | null } & Record<string, unknown>;
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

// Idempotente no servidor: confirmar de novo uma operação já executada devolve o resultado, sem repetir.
export function confirmAiAction(id: string) {
  return request<AiAction>(`/ai/actions/${id}/confirm`, { method: 'POST', auth: true });
}

export function cancelAiAction(id: string) {
  return request<AiAction>(`/ai/actions/${id}/cancel`, { method: 'POST', auth: true });
}

export type AiUsage = {
  plan: { id: 'free' | 'starter' | 'premium'; name: string };
  messages: { used: number; limit: number; remaining: number };
  // Quando o limite volta a zerar (início do próximo mês).
  resetsAt: string;
  maxMessageChars: number;
  maxAudioSeconds: number;
};

export function getAiUsage() {
  return request<AiUsage>('/ai/usage', { auth: true });
}

// Manda o áudio gravado e devolve o texto. Não usa `request()`: pelo mesmo motivo de
// `uploadProductImage` (o fetch do Expo não aceita arquivo em FormData), o upload é feito pelo
// `expo-file-system`, no nível nativo — por isso o header de autenticação é montado à mão.
export async function transcribeAiAudio(uri: string): Promise<{ text: string }> {
  const token = await getFreshAccessToken();

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync(`${API_URL}/ai/transcribe`, uri, {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'audio',
      mimeType: 'audio/m4a',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new NetworkError();
  }

  let data: unknown = null;
  if (result.body) {
    try {
      data = JSON.parse(result.body);
    } catch {
      data = null;
    }
  }

  if (result.status < 200 || result.status >= 300) {
    const body = (data ?? {}) as { error?: unknown; message?: unknown };
    const code = typeof body.error === 'string' ? body.error : 'UNKNOWN_ERROR';
    const fallback =
      result.status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Não foi possível entender o áudio.';
    const message = typeof body.message === 'string' && body.message ? body.message : fallback;
    throw new ApiError(result.status, code, message);
  }

  return data as { text: string };
}
