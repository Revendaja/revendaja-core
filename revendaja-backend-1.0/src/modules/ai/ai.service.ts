import { createHash } from 'node:crypto';
import { toFile } from 'openai';
import type OpenAI from 'openai';
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import { STORE_PLAN_NAMES } from '../store/store.plans';
import type { Store } from '../store/store.types';
import { getOpenAIClient } from './ai.client';
import { AI_PLAN_LIMITS, MAX_AI_MESSAGE_CHARS, MAX_AUDIO_SECONDS } from './ai.limits';
import { usagePeriod } from './ai.period';
import { buildSystemPrompt } from './ai.prompt';
import {
  aiRepository,
  type AiActionRow,
  type AiRepository,
  type AiUsageField,
  type NewAiMessage,
  type StoredAiMessage,
} from './ai.repository';
import type { ChatBody } from './ai.schema';
import type {
  AiActionStatus,
  AiActionView,
  AiItem,
  AiToolContext,
  ChatResult,
  UiCard,
} from './ai.types';
import { getTool, TOOL_DEFINITIONS } from './tools';

const MAX_OUTPUT_TOKENS = 4096;
// Resultado de ferramenta grande demais é cortado: protege o contexto (e o custo) do modelo.
const MAX_TOOL_RESULT_CHARS = 20_000;
const HISTORY_DISPLAY_LIMIT = 100;
const CONVERSATION_LIST_LIMIT = 30;
const TITLE_MAX_LENGTH = 60;
// Avisos automáticos do app gravados no histórico (o modelo os lê; o prompt explica o prefixo).
const NOTICE_PREFIX = '[sistema]';

const REFUSAL_MESSAGE =
  'Não consigo ajudar com esse pedido. Posso te ajudar com o estoque, as finanças ou as vendas da sua loja.';
const TRUNCATED_MESSAGE =
  'A resposta ficou longa demais e foi cortada. Pode pedir de um jeito mais específico?';
const GAVE_UP_MESSAGE =
  'Não consegui concluir isso agora. Pode tentar de novo, ou pedir de outro jeito?';

type OpenAIClientFactory = () => OpenAI;
type FunctionCall = Extract<AiItem, { type: 'function_call' }>;

interface TurnState {
  cards: Map<string, UiCard>;
  actions: AiActionView[];
}

interface ModelOutput {
  text: string;
  calls: FunctionCall[];
  refused: boolean;
  truncated: boolean;
}

function cardKey(card: UiCard): string {
  return card.type === 'catalog_product'
    ? `catalog:${card.productId}`
    : `stock:${card.storeProductId}`;
}

function toActionView(row: AiActionRow): AiActionView {
  return {
    id: row.id,
    tool: row.tool,
    summary: row.summary,
    preview: (row.preview as Record<string, unknown> | null) ?? null,
    status: row.status as AiActionStatus,
    result: row.result ?? null,
    error: row.error,
    expiresAt: row.expiresAt,
  };
}

function hashAction(tool: string, payload: unknown): string {
  return createHash('sha256')
    .update(`${tool}:${JSON.stringify(payload)}`)
    .digest('hex');
}

// Só o texto da resposta e as chamadas de ferramenta vão para o histórico. Os itens de raciocínio
// (reasoning) do modelo ficam de fora: valem só dentro da requisição que os gerou.
function readOutput(response: OpenAIResponse): ModelOutput {
  const texts: string[] = [];
  const calls: FunctionCall[] = [];
  let refused = false;

  for (const item of response.output) {
    if (item.type === 'function_call') {
      calls.push({
        type: 'function_call',
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      });
    } else if (item.type === 'message') {
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text.trim() !== '') texts.push(part.text);
        if (part.type === 'refusal') refused = true;
      }
    }
  }

  const reason = response.incomplete_details?.reason;
  if (reason === 'content_filter') refused = true;
  return {
    text: texts.join('\n').trim(),
    calls,
    refused,
    truncated: response.status === 'incomplete' && reason === 'max_output_tokens',
  };
}

function itemText(content: Prisma.JsonValue): string {
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((item) =>
      item && typeof item === 'object' && !Array.isArray(item) && typeof item.content === 'string'
        ? [item.content]
        : [],
    )
    .join('\n')
    .trim();
}

export class AiService {
  constructor(
    private readonly repository: AiRepository = aiRepository,
    private readonly stores: Pick<StoreRepository, 'findByUserId'> = storeRepository,
    private readonly getClient: OpenAIClientFactory = getOpenAIClient,
  ) {}

  // Uma mensagem da usuária: roda o ciclo modelo -> ferramentas -> modelo até a resposta final e
  // grava o turno inteiro de uma vez.
  async chat(userId: string, input: ChatBody): Promise<ChatResult> {
    const client = this.getClient();
    const store = await this.getOwnStoreOrThrow(userId);

    const existing = input.conversationId
      ? await this.repository.findConversation(store.id, input.conversationId)
      : null;
    if (input.conversationId && !existing) {
      throw new NotFoundError('Conversa não encontrada.');
    }

    // Limite do plano: a vaga é reservada ANTES de chamar o modelo (e devolvida se der erro).
    const period = usagePeriod();
    await this.reserveOrThrow(store, period, 'messages');

    try {
      const conversation =
        existing ??
        (await this.repository.createConversation(
          store.id,
          input.message.slice(0, TITLE_MAX_LENGTH),
        ));
      try {
        return await this.runTurn(client, store, conversation.id, input.message, period.key);
      } catch (error) {
        // Conversa nova cujo primeiro turno falhou: não deixa uma conversa vazia para trás.
        if (!existing) {
          await this.repository.deleteConversation(conversation.id).catch(() => undefined);
        }
        throw error;
      }
    } catch (error) {
      await this.releaseQuietly(store.id, period.key, 'messages');
      throw error;
    }
  }

  // Quanto a loja já usou do limite do plano neste mês.
  async getUsage(userId: string) {
    const store = await this.getOwnStoreOrThrow(userId);
    const period = usagePeriod();
    const used = (await this.repository.getUsage(store.id, period.key))?.messages ?? 0;
    const limit = AI_PLAN_LIMITS[store.plan].messagesPerMonth;
    return {
      plan: { id: store.plan, name: STORE_PLAN_NAMES[store.plan] },
      messages: { used, limit, remaining: Math.max(0, limit - used) },
      resetsAt: period.resetsAt,
      maxMessageChars: MAX_AI_MESSAGE_CHARS,
      maxAudioSeconds: MAX_AUDIO_SECONDS,
    };
  }

  // Voz -> texto. O app mostra o texto para a usuária revisar antes de enviar como mensagem.
  async transcribe(
    userId: string,
    file: { buffer: Buffer; filename: string; mimeType: string },
  ): Promise<{ text: string }> {
    const client = this.getClient();
    const store = await this.getOwnStoreOrThrow(userId);
    const period = usagePeriod();
    await this.reserveOrThrow(store, period, 'transcriptions');

    try {
      const result = await client.audio.transcriptions.create({
        file: await toFile(file.buffer, file.filename, { type: file.mimeType }),
        model: env.AI_TRANSCRIBE_MODEL,
      });
      return { text: result.text.trim() };
    } catch (error) {
      await this.releaseQuietly(store.id, period.key, 'transcriptions');
      throw error;
    }
  }

  private async reserveOrThrow(
    store: Store,
    period: ReturnType<typeof usagePeriod>,
    field: AiUsageField,
  ): Promise<void> {
    const limits = AI_PLAN_LIMITS[store.plan];
    const limit = field === 'messages' ? limits.messagesPerMonth : limits.transcriptionsPerMonth;
    if (await this.repository.reserveUsage(store.id, period.key, field, limit)) return;

    const resets = period.resetsAt.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
    });
    throw new AppError(
      `Você usou todas as ${limit} mensagens do assistente do plano ${STORE_PLAN_NAMES[store.plan]} neste mês. O limite renova em ${resets}.`,
      429,
      'AI_LIMIT_REACHED',
    );
  }

  private async releaseQuietly(storeId: string, period: string, field: AiUsageField) {
    await this.repository
      .releaseUsage(storeId, period, field)
      .catch((error) => logger.error({ err: error, storeId, field }, 'ai usage release failed'));
  }

  private async runTurn(
    client: OpenAI,
    store: Store,
    conversationId: string,
    message: string,
    periodKey: string,
  ): Promise<ChatResult> {
    const ctx: AiToolContext = { userId: store.userId, storeId: store.id, conversationId };
    const history = await this.repository.loadHistory(conversationId, env.AI_HISTORY_TURNS);
    const historyItems = history.flatMap((row) => row.content as AiItem[]);

    const fresh: NewAiMessage[] = [
      { role: 'user', content: [{ role: 'user', content: message }], turnStart: true },
    ];
    const turn: TurnState = { cards: new Map(), actions: [] };
    const instructions = buildSystemPrompt(store.storeName);
    let finalText: string | null = null;

    for (let round = 0; round < env.AI_MAX_TOOL_ITERATIONS && finalText === null; round++) {
      const response = await client.responses.create({
        model: env.AI_MODEL,
        instructions,
        input: [...historyItems, ...fresh.flatMap((row) => row.content as AiItem[])],
        tools: TOOL_DEFINITIONS,
        // O histórico é nosso (ai_messages): nada fica guardado na OpenAI.
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        reasoning: { effort: env.AI_REASONING_EFFORT },
      });

      // Consumo de tokens, só para acompanhar o custo por loja (o limite é em mensagens).
      if (response.usage) {
        void this.repository
          .addTokens(store.id, periodKey, response.usage.input_tokens, response.usage.output_tokens)
          .catch((error) => logger.error({ err: error }, 'ai token usage failed'));
      }

      const output = readOutput(response);

      if (output.calls.length > 0) {
        const assistantItems: AiItem[] = [
          ...(output.text ? [{ role: 'assistant' as const, content: output.text }] : []),
          ...output.calls,
        ];
        fresh.push({ role: 'assistant', content: assistantItems });
        const results = await Promise.all(
          output.calls.map((call) => this.runTool(call, ctx, turn)),
        );
        fresh.push({ role: 'tool', content: results });
        continue;
      }

      // Resposta final (ou uma parada anormal): sempre guarda ao menos um texto, porque o histórico
      // não pode ter mensagem vazia.
      let text = output.text;
      if (output.refused) text = text || REFUSAL_MESSAGE;
      if (output.truncated) text = text ? `${text}\n\n${TRUNCATED_MESSAGE}` : TRUNCATED_MESSAGE;
      text = text || GAVE_UP_MESSAGE;
      fresh.push({ role: 'assistant', content: [{ role: 'assistant', content: text }] });
      finalText = text;
    }

    if (finalText === null) {
      // Estourou o limite de rodadas com ferramentas ainda pendentes: fecha o turno com um aviso.
      fresh.push({ role: 'assistant', content: [{ role: 'assistant', content: GAVE_UP_MESSAGE }] });
      finalText = GAVE_UP_MESSAGE;
    }

    await this.repository.appendMessages(conversationId, fresh);
    return {
      conversationId,
      message: finalText,
      cards: [...turn.cards.values()],
      pendingActions: turn.actions,
    };
  }

  private async runTool(call: FunctionCall, ctx: AiToolContext, turn: TurnState): Promise<AiItem> {
    const reply = (payload: unknown): AiItem => ({
      type: 'function_call_output',
      call_id: call.call_id,
      output: JSON.stringify(payload).slice(0, MAX_TOOL_RESULT_CHARS),
    });
    const fail = (message: string): AiItem => reply({ error: message });

    const tool = getTool(call.name);
    if (!tool) return fail(`Ferramenta desconhecida: ${call.name}.`);

    let args: unknown;
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {};
    } catch {
      return fail('Os parâmetros não são um JSON válido.');
    }

    const parsed = tool.input.safeParse(args);
    if (!parsed.success) {
      return fail(
        `Parâmetros inválidos: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'entrada'}: ${issue.message}`).join('; ')}`,
      );
    }

    try {
      if (tool.kind === 'read') {
        const result = await tool.run(ctx, parsed.data);
        for (const card of result.cards ?? []) turn.cards.set(cardKey(card), card);
        logger.info(
          { storeId: ctx.storeId, conversationId: ctx.conversationId, tool: tool.name },
          'ai tool read',
        );
        return reply(result.data);
      }

      // Escrita: só prepara. Nada é gravado no banco de negócio até a usuária confirmar.
      const prepared = await tool.prepare(ctx, parsed.data);
      const payloadHash = hashAction(tool.name, prepared.payload);
      const now = new Date();
      const action =
        (await this.repository.findPendingByHash(ctx.conversationId, payloadHash, now)) ??
        (await this.repository.createAction({
          storeId: ctx.storeId,
          conversationId: ctx.conversationId,
          tool: tool.name,
          payload: prepared.payload as Prisma.InputJsonValue,
          payloadHash,
          summary: prepared.summary,
          preview: prepared.preview as Prisma.InputJsonValue,
          expiresAt: new Date(now.getTime() + env.AI_ACTION_TTL_MINUTES * 60_000),
        }));
      if (!turn.actions.some((existing) => existing.id === action.id)) {
        turn.actions.push(toActionView(action));
      }
      logger.info(
        {
          storeId: ctx.storeId,
          conversationId: ctx.conversationId,
          tool: tool.name,
          actionId: action.id,
        },
        'ai action proposed',
      );
      return reply({
        status: 'awaiting_confirmation',
        summary: prepared.summary,
        expiresInMinutes: env.AI_ACTION_TTL_MINUTES,
        note: 'Nada foi alterado ainda. A usuária precisa confirmar pelo botão no app.',
      });
    } catch (error) {
      // Mensagens de AppError são regras de negócio escritas para a usuária: o modelo pode repassá-las.
      if (error instanceof AppError) return fail(error.message);
      logger.error(
        { err: error, storeId: ctx.storeId, conversationId: ctx.conversationId, tool: tool.name },
        'ai tool failed',
      );
      return fail('Erro interno ao consultar o sistema. Tente novamente em instantes.');
    }
  }

  // Executa uma operação proposta pela IA, só depois do "confirmar" da usuária. Idempotente: confirmar
  // de novo uma operação já executada devolve o resultado de antes, sem executar outra vez.
  async confirmAction(userId: string, actionId: string): Promise<AiActionView> {
    const store = await this.getOwnStoreOrThrow(userId);
    const action = await this.getActionOrThrow(store.id, actionId);

    if (action.status === 'executed') return toActionView(action);
    if (action.status !== 'pending') throw this.notConfirmable(action.status);

    const now = new Date();
    if (action.expiresAt <= now) {
      await this.repository.expirePending(store.id, action.id);
      throw this.notConfirmable('expired');
    }

    const claimed = await this.repository.claimForExecution(store.id, action.id, now);
    if (!claimed) {
      // Outra chamada confirmou (ou cancelou) no mesmo instante: devolve o estado atual.
      const current = await this.getActionOrThrow(store.id, action.id);
      if (current.status === 'executed') return toActionView(current);
      throw this.notConfirmable(current.status);
    }

    const tool = getTool(action.tool);
    if (!tool || tool.kind !== 'write') {
      await this.repository.finishAction(action.id, 'failed', { error: 'Operação desconhecida.' });
      throw new AppError('Operação desconhecida.', 400, 'AI_ACTION_UNKNOWN');
    }

    const ctx: AiToolContext = { userId, storeId: store.id, conversationId: action.conversationId };
    try {
      const result = await tool.apply(ctx, action.payload);
      await this.repository.finishAction(action.id, 'executed', {
        result: (result ?? null) as Prisma.InputJsonValue,
      });
      logger.info(
        { storeId: store.id, actionId: action.id, tool: action.tool },
        'ai action executed',
      );
      await this.addNotice(
        action,
        `${NOTICE_PREFIX} A operação foi confirmada e executada com sucesso: ${action.summary}`,
      );
      return toActionView({
        ...action,
        status: 'executed',
        result: (result ?? null) as Prisma.JsonValue,
      });
    } catch (error) {
      const message =
        error instanceof AppError ? error.message : 'Não foi possível concluir a operação.';
      await this.repository.finishAction(action.id, 'failed', { error: message });
      logger.error(
        { err: error, storeId: store.id, actionId: action.id, tool: action.tool },
        'ai action failed',
      );
      await this.addNotice(
        action,
        `${NOTICE_PREFIX} A operação foi confirmada, mas falhou: ${message} (${action.summary})`,
      );
      throw error;
    }
  }

  async cancelAction(userId: string, actionId: string): Promise<AiActionView> {
    const store = await this.getOwnStoreOrThrow(userId);
    const action = await this.getActionOrThrow(store.id, actionId);

    if (action.status === 'cancelled') return toActionView(action);
    const cancelled = await this.repository.cancelPending(store.id, action.id);
    if (!cancelled) {
      const current = await this.getActionOrThrow(store.id, action.id);
      throw this.notConfirmable(current.status);
    }
    await this.addNotice(
      action,
      `${NOTICE_PREFIX} A usuária cancelou a operação: ${action.summary}`,
    );
    return toActionView({ ...action, status: 'cancelled' });
  }

  async listConversations(userId: string) {
    const store = await this.getOwnStoreOrThrow(userId);
    const items = await this.repository.listConversations(store.id, CONVERSATION_LIST_LIMIT);
    return { items: items.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })) };
  }

  // Histórico para exibir no chat: só o que a usuária e a assistente "disseram" (sem as chamadas de
  // ferramenta), mais as operações ainda aguardando confirmação.
  async getConversationMessages(userId: string, conversationId: string) {
    const store = await this.getOwnStoreOrThrow(userId);
    const conversation = await this.repository.findConversation(store.id, conversationId);
    if (!conversation) throw new NotFoundError('Conversa não encontrada.');

    const [rows, pending] = await Promise.all([
      this.repository.listMessages(conversation.id, HISTORY_DISPLAY_LIMIT),
      this.repository.listPendingActions(conversation.id, store.id, new Date()),
    ]);

    const items = rows.flatMap((row: StoredAiMessage) => {
      if (row.role === 'tool') return [];
      const text = itemText(row.content);
      if (text === '') return []; // só chamadas de ferramenta
      const role =
        row.role === 'assistant' ? 'assistant' : text.startsWith(NOTICE_PREFIX) ? 'notice' : 'user';
      return [
        {
          id: row.id,
          role: role as 'user' | 'assistant' | 'notice',
          text: role === 'notice' ? text.slice(NOTICE_PREFIX.length).trim() : text,
          createdAt: row.createdAt,
        },
      ];
    });

    return { items, pendingActions: pending.map(toActionView) };
  }

  // Registra no histórico o desfecho de uma operação, para a próxima resposta do modelo saber.
  private async addNotice(action: AiActionRow, text: string): Promise<void> {
    await this.repository
      .appendMessages(action.conversationId, [
        { role: 'user', content: [{ role: 'user', content: text }] },
      ])
      .catch((error) => logger.error({ err: error, actionId: action.id }, 'ai notice failed'));
  }

  private notConfirmable(status: string): AppError {
    switch (status) {
      case 'cancelled':
        return new ConflictError('Esta operação foi cancelada.');
      case 'expired':
        return new AppError(
          'Esta operação expirou. Peça de novo para eu refazer.',
          409,
          'AI_ACTION_EXPIRED',
        );
      case 'executing':
        return new ConflictError('Esta operação já está sendo executada.');
      case 'failed':
        return new ConflictError('Esta operação já falhou. Peça de novo para eu refazer.');
      default:
        return new ConflictError('Esta operação não pode mais ser confirmada.');
    }
  }

  private async getActionOrThrow(storeId: string, actionId: string): Promise<AiActionRow> {
    const action = await this.repository.findAction(storeId, actionId);
    if (!action) throw new NotFoundError('Operação não encontrada.');
    return action;
  }

  private async getOwnStoreOrThrow(userId: string): Promise<Store> {
    const store = await this.stores.findByUserId(userId);
    if (!store) throw new NotFoundError('Você ainda não possui uma loja.');
    return store;
  }
}

export const aiService = new AiService();
