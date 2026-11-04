import type OpenAI from 'openai';
import type { AiRepository } from '../ai.repository';
import { AI_PLAN_LIMITS } from '../ai.limits';
import { usagePeriod } from '../ai.period';
import { AiService } from '../ai.service';

jest.mock('../tools', () => ({ TOOL_DEFINITIONS: [], getTool: () => undefined }));

const STORE = { id: 'store-1', userId: 'user-1', storeName: 'Loja da Ana', plan: 'free' };

function makeRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    createConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    findConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    loadHistory: jest.fn().mockResolvedValue([]),
    appendMessages: jest.fn().mockResolvedValue(undefined),
    reserveUsage: jest.fn().mockResolvedValue(true),
    releaseUsage: jest.fn().mockResolvedValue(undefined),
    addTokens: jest.fn().mockResolvedValue(undefined),
    getUsage: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as AiRepository & Record<string, jest.Mock>;
}

function makeClient(create: jest.Mock, transcribe: jest.Mock = jest.fn()) {
  return {
    responses: { create },
    audio: { transcriptions: { create: transcribe } },
  } as unknown as OpenAI;
}

const reply = {
  status: 'completed',
  usage: { input_tokens: 120, output_tokens: 30 },
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Oi!' }] }],
};

function makeService(repo: AiRepository, client: OpenAI) {
  const stores = { findByUserId: jest.fn().mockResolvedValue(STORE) };
  return new AiService(repo, stores as never, () => client);
}

describe('limite de uso do assistente', () => {
  it('reserva uma mensagem do plano antes de chamar o modelo e registra os tokens', async () => {
    const repo = makeRepository();
    const create = jest.fn().mockResolvedValue(reply);

    await makeService(repo, makeClient(create)).chat('user-1', { message: 'oi' });

    expect(repo.reserveUsage).toHaveBeenCalledWith(
      'store-1',
      usagePeriod().key,
      'messages',
      AI_PLAN_LIMITS.free.messagesPerMonth,
    );
    expect(repo.addTokens).toHaveBeenCalledWith('store-1', usagePeriod().key, 120, 30);
    expect(repo.releaseUsage).not.toHaveBeenCalled();
  });

  it('limite atingido: responde 429 e NÃO chama o modelo nem cria conversa', async () => {
    const repo = makeRepository({ reserveUsage: jest.fn().mockResolvedValue(false) });
    const create = jest.fn();

    await expect(
      makeService(repo, makeClient(create)).chat('user-1', { message: 'oi' }),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AI_LIMIT_REACHED' });

    expect(create).not.toHaveBeenCalled();
    expect(repo.createConversation).not.toHaveBeenCalled();
    // Não houve reserva: não há nada a devolver.
    expect(repo.releaseUsage).not.toHaveBeenCalled();
  });

  it('a mensagem de limite cita o plano e quando renova', async () => {
    const repo = makeRepository({ reserveUsage: jest.fn().mockResolvedValue(false) });

    await expect(
      makeService(repo, makeClient(jest.fn())).chat('user-1', { message: 'oi' }),
    ).rejects.toThrow(/15 mensagens.*Gratuito.*renova em \d{2}\/\d{2}/);
  });

  it('erro ao falar com o modelo devolve a mensagem reservada (a usuária não paga por falha)', async () => {
    const repo = makeRepository();
    const create = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      makeService(repo, makeClient(create)).chat('user-1', { message: 'oi' }),
    ).rejects.toThrow('boom');

    expect(repo.releaseUsage).toHaveBeenCalledWith('store-1', usagePeriod().key, 'messages');
  });

  it('getUsage mostra usado, limite e quanto resta', async () => {
    const repo = makeRepository({
      getUsage: jest
        .fn()
        .mockResolvedValue({ messages: 4, transcriptions: 1, inputTokens: 1, outputTokens: 1 }),
    });

    const usage = await makeService(repo, makeClient(jest.fn())).getUsage('user-1');

    expect(usage.messages).toEqual({ used: 4, limit: 15, remaining: 11 });
    expect(usage.plan).toEqual({ id: 'free', name: 'Gratuito' });
    expect(usage.resetsAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('getUsage nunca devolve "restante" negativo', async () => {
    const repo = makeRepository({
      getUsage: jest
        .fn()
        .mockResolvedValue({ messages: 99, transcriptions: 0, inputTokens: 0, outputTokens: 0 }),
    });

    const usage = await makeService(repo, makeClient(jest.fn())).getUsage('user-1');

    expect(usage.messages.remaining).toBe(0);
  });
});

describe('transcrição de voz', () => {
  const file = { buffer: Buffer.from('audio'), filename: 'voz.m4a', mimeType: 'audio/m4a' };

  it('transcreve e consome uma transcrição do limite', async () => {
    const repo = makeRepository();
    const transcribe = jest.fn().mockResolvedValue({ text: '  quanto lucrei esse mês  ' });

    const result = await makeService(repo, makeClient(jest.fn(), transcribe)).transcribe(
      'user-1',
      file,
    );

    expect(result).toEqual({ text: 'quanto lucrei esse mês' });
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-transcribe' }));
    expect(repo.reserveUsage).toHaveBeenCalledWith(
      'store-1',
      usagePeriod().key,
      'transcriptions',
      AI_PLAN_LIMITS.free.transcriptionsPerMonth,
    );
  });

  it('limite atingido: não chama a transcrição', async () => {
    const repo = makeRepository({ reserveUsage: jest.fn().mockResolvedValue(false) });
    const transcribe = jest.fn();

    await expect(
      makeService(repo, makeClient(jest.fn(), transcribe)).transcribe('user-1', file),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('falha na transcrição devolve a vaga reservada', async () => {
    const repo = makeRepository();
    const transcribe = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      makeService(repo, makeClient(jest.fn(), transcribe)).transcribe('user-1', file),
    ).rejects.toThrow('boom');
    expect(repo.releaseUsage).toHaveBeenCalledWith('store-1', usagePeriod().key, 'transcriptions');
  });
});
