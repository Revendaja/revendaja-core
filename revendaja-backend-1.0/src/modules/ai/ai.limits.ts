import type { StorePlan } from '../store/store.types';

// Quanto cada plano pode usar o assistente por mês (calendário de Brasília). É o controle de custo:
// cada mensagem da usuária chama o modelo (às vezes mais de uma vez, com ferramentas), então o teto
// é em MENSAGENS. Ajuste os números aqui — nada mais precisa mudar.
//
// Mensagem por voz gasta uma mensagem (e uma transcrição). O limite de transcrições é igual ao de
// mensagens: quem grava mais do que pode enviar não tem o que fazer com o áudio.
export interface AiPlanLimits {
  messagesPerMonth: number;
  transcriptionsPerMonth: number;
}

export const AI_PLAN_LIMITS: Record<StorePlan, AiPlanLimits> = {
  free: { messagesPerMonth: 15, transcriptionsPerMonth: 15 },
  starter: { messagesPerMonth: 150, transcriptionsPerMonth: 150 },
  premium: { messagesPerMonth: 500, transcriptionsPerMonth: 500 },
  business: { messagesPerMonth: 1500, transcriptionsPerMonth: 1500 },
};

// Tamanho de uma mensagem digitada (também aplicado no campo do app).
export const MAX_AI_MESSAGE_CHARS = 2000;

// Áudio de uma mensagem por voz: até 60 s no app; 5 MB sobra para m4a nesse tempo.
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 60;
