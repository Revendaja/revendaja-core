import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { AiActionStatus } from './ai.types';

// Toda consulta de conversa/ação filtra por `storeId`: o isolamento entre consultoras mora aqui.

export interface NewAiMessage {
  // `tool` = resultados de ferramentas devolvidos ao modelo (não aparecem no chat).
  role: 'user' | 'assistant' | 'tool';
  // Itens da Responses API (ver AiItem).
  content: unknown;
  turnStart?: boolean;
}

export interface StoredAiMessage {
  id: string;
  role: string;
  content: Prisma.JsonValue;
  createdAt: Date;
}

export interface AiActionRow {
  id: string;
  storeId: string;
  conversationId: string;
  tool: string;
  payload: Prisma.JsonValue;
  summary: string;
  preview: Prisma.JsonValue | null;
  status: string;
  result: Prisma.JsonValue | null;
  error: string | null;
  expiresAt: Date;
}

export interface CreateAiActionData {
  storeId: string;
  conversationId: string;
  tool: string;
  payload: Prisma.InputJsonValue;
  payloadHash: string;
  summary: string;
  preview: Prisma.InputJsonValue;
  expiresAt: Date;
}

const ACTION_SELECT = {
  id: true,
  storeId: true,
  conversationId: true,
  tool: true,
  payload: true,
  summary: true,
  preview: true,
  status: true,
  result: true,
  error: true,
  expiresAt: true,
} satisfies Prisma.AiActionSelect;

export type AiUsageField = 'messages' | 'transcriptions';

export interface AiUsageRow {
  messages: number;
  transcriptions: number;
  inputTokens: number;
  outputTokens: number;
}

export const aiRepository = {
  createConversation(storeId: string, title: string) {
    return prisma.aiConversation.create({ data: { storeId, title } });
  },

  findConversation(storeId: string, id: string) {
    return prisma.aiConversation.findFirst({ where: { id, storeId } });
  },

  deleteConversation(id: string) {
    return prisma.aiConversation.delete({ where: { id } });
  },

  listConversations(storeId: string, limit: number) {
    return prisma.aiConversation.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  },

  // As últimas `turns` mensagens da usuária e tudo que veio depois delas. O corte cai sempre numa
  // mensagem de abertura de turno, então nunca separa um function_call do seu function_call_output.
  async loadHistory(conversationId: string, turns: number): Promise<StoredAiMessage[]> {
    const starts = await prisma.aiMessage.findMany({
      where: { conversationId, turnStart: true },
      orderBy: { createdAt: 'desc' },
      take: turns,
      select: { createdAt: true },
    });
    const oldest = starts.at(-1);
    if (!oldest) return [];

    return prisma.aiMessage.findMany({
      where: { conversationId, createdAt: { gte: oldest.createdAt } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });
  },

  // Mensagens para exibir no chat (sem o limite de turnos do contexto do modelo).
  listMessages(conversationId: string, limit: number): Promise<StoredAiMessage[]> {
    return prisma.aiMessage
      .findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, role: true, content: true, createdAt: true },
      })
      .then((rows) => rows.reverse());
  },

  // Grava o turno inteiro de uma vez: se algo falhar no meio, nada fica pela metade (um function_call
  // sem function_call_output quebraria a conversa nas próximas chamadas). Cada mensagem recebe um instante
  // próprio, crescente, para a ordem ser sempre a mesma na releitura.
  async appendMessages(conversationId: string, messages: NewAiMessage[]): Promise<void> {
    const base = Date.now();
    await prisma.$transaction([
      prisma.aiMessage.createMany({
        data: messages.map((message, index) => ({
          conversationId,
          role: message.role,
          content: message.content as Prisma.InputJsonValue,
          turnStart: message.turnStart ?? false,
          createdAt: new Date(base + index),
        })),
      }),
      prisma.aiConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  },

  findAction(storeId: string, id: string): Promise<AiActionRow | null> {
    return prisma.aiAction.findFirst({ where: { id, storeId }, select: ACTION_SELECT });
  },

  listPendingActions(conversationId: string, storeId: string, now: Date): Promise<AiActionRow[]> {
    return prisma.aiAction.findMany({
      where: { conversationId, storeId, status: 'pending', expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      select: ACTION_SELECT,
    });
  },

  // A mesma proposta (mesma ferramenta e payload) já aguardando confirmação nesta conversa.
  findPendingByHash(
    conversationId: string,
    payloadHash: string,
    now: Date,
  ): Promise<AiActionRow | null> {
    return prisma.aiAction.findFirst({
      where: { conversationId, payloadHash, status: 'pending', expiresAt: { gt: now } },
      select: ACTION_SELECT,
    });
  },

  createAction(data: CreateAiActionData): Promise<AiActionRow> {
    return prisma.aiAction.create({ data, select: ACTION_SELECT });
  },

  // Só UMA chamada consegue passar de `pending` para `executing`: é isso que impede a mesma
  // operação de ser executada duas vezes (duplo toque, retry do app, duas abas).
  async claimForExecution(storeId: string, id: string, now: Date): Promise<boolean> {
    const { count } = await prisma.aiAction.updateMany({
      where: { id, storeId, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'executing' },
    });
    return count === 1;
  },

  async finishAction(
    id: string,
    status: Extract<AiActionStatus, 'executed' | 'failed'>,
    data: { result?: Prisma.InputJsonValue; error?: string },
  ): Promise<void> {
    await prisma.aiAction.update({
      where: { id },
      data: { status, result: data.result, error: data.error, executedAt: new Date() },
    });
  },

  // Cancela só se ainda estiver pendente (não desfaz uma operação já executada).
  async cancelPending(storeId: string, id: string): Promise<boolean> {
    const { count } = await prisma.aiAction.updateMany({
      where: { id, storeId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    return count === 1;
  },

  async expirePending(storeId: string, id: string): Promise<void> {
    await prisma.aiAction.updateMany({
      where: { id, storeId, status: 'pending' },
      data: { status: 'expired' },
    });
  },

  // Reserva UMA unidade do limite antes de chamar o modelo. O UPDATE condicional (`campo < limite`)
  // é o que garante que requisições simultâneas nunca passem do teto: só uma "ganha" a última vaga.
  async reserveUsage(
    storeId: string,
    period: string,
    field: AiUsageField,
    limit: number,
  ): Promise<boolean> {
    await prisma.aiUsage.upsert({
      where: { storeId_period: { storeId, period } },
      create: { storeId, period },
      update: {},
    });
    const { count } = await prisma.aiUsage.updateMany({
      where: { storeId, period, [field]: { lt: limit } },
      data: { [field]: { increment: 1 } },
    });
    return count === 1;
  },

  // Devolve a unidade reservada quando a chamada falhou antes de dar resposta (a usuária não paga
  // por erro nosso).
  async releaseUsage(storeId: string, period: string, field: AiUsageField): Promise<void> {
    await prisma.aiUsage.updateMany({
      where: { storeId, period, [field]: { gt: 0 } },
      data: { [field]: { decrement: 1 } },
    });
  },

  async addTokens(
    storeId: string,
    period: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    await prisma.aiUsage.updateMany({
      where: { storeId, period },
      data: { inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
    });
  },

  async getUsage(storeId: string, period: string): Promise<AiUsageRow | null> {
    return prisma.aiUsage.findUnique({
      where: { storeId_period: { storeId, period } },
      select: { messages: true, transcriptions: true, inputTokens: true, outputTokens: true },
    });
  },
};

export type AiRepository = typeof aiRepository;
