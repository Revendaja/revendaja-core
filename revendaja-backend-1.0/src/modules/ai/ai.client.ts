import OpenAI from 'openai';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';

let client: OpenAI | undefined;

// Sem OPENAI_API_KEY o assistente fica indisponível (503), mas o resto da API sobe normalmente.
export function getOpenAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new AppError('O assistente de IA não está configurado.', 503, 'AI_NOT_CONFIGURED');
  }
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 2 });
  return client;
}
