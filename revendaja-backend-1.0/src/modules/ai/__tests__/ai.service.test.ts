import type OpenAI from 'openai';
import { AppError } from '../../../shared/errors/AppError';
import type { AiActionRow, AiRepository } from '../ai.repository';
import { AiService } from '../ai.service';
import type { AiTool } from '../ai.types';

// As ferramentas reais falam com o banco; aqui o foco é o ciclo da conversa, a confirmação e o
// isolamento, então o registro de ferramentas é trocado por duas de mentira.
const readRun = jest.fn();
const writePrepare = jest.fn();
const writeApply = jest.fn();

const fakeTools: Record<string, AiTool> = {
  read_thing: {
    kind: 'read',
    name: 'read_thing',
    description: 'lê',
    input: { safeParse: (value: unknown) => ({ success: true, data: value }) } as never,
    run: readRun,
  },
  propose_thing: {
    kind: 'write',
    name: 'propose_thing',
    description: 'propõe',
    input: { safeParse: (value: unknown) => ({ success: true, data: value }) } as never,
    prepare: writePrepare,
    apply: writeApply,
  },
};

jest.mock('../tools', () => ({
  TOOL_DEFINITIONS: [],
  getTool: (name: string) => fakeTools[name],
}));

const STORE = { id: 'store-1', userId: 'user-1', storeName: 'Loja da Ana', plan: 'starter' };

function makeRepository(overrides: Partial<Record<keyof AiRepository, jest.Mock>> = {}) {
  const repo = {
    createConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    findConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    listConversations: jest.fn().mockResolvedValue([]),
    loadHistory: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue([]),
    appendMessages: jest.fn().mockResolvedValue(undefined),
    findAction: jest.fn(),
    listPendingActions: jest.fn().mockResolvedValue([]),
    reserveUsage: jest.fn().mockResolvedValue(true),
    releaseUsage: jest.fn().mockResolvedValue(undefined),
    addTokens: jest.fn().mockResolvedValue(undefined),
    getUsage: jest.fn().mockResolvedValue(null),
    findPendingByHash: jest.fn().mockResolvedValue(null),
    createAction: jest.fn(),
    claimForExecution: jest.fn().mockResolvedValue(true),
    finishAction: jest.fn().mockResolvedValue(undefined),
    cancelPending: jest.fn().mockResolvedValue(true),
    expirePending: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo as unknown as AiRepository & Record<keyof AiRepository, jest.Mock>;
}

function actionRow(overrides: Partial<AiActionRow> = {}): AiActionRow {
  return {
    id: 'act-1',
    storeId: STORE.id,
    conversationId: 'conv-1',
    tool: 'propose_thing',
    payload: { a: 1 },
    summary: 'Fazer a coisa',
    preview: { name: 'X' },
    status: 'pending',
    result: null,
    error: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

interface Reply {
  status: string;
  output: unknown[];
  incomplete_details?: { reason: string };
}

function makeClient(replies: Reply[]) {
  const create = jest.fn();
  replies.forEach((reply) => create.mockResolvedValueOnce(reply));
  return { client: { responses: { create } } as unknown as OpenAI, create };
}

function textReply(text: string): Reply {
  return {
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
    ],
  };
}

function toolReply(name: string, input: unknown = {}, id = 'tu_1'): Reply {
  return {
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      { type: 'function_call', id: 'fc_1', call_id: id, name, arguments: JSON.stringify(input) },
    ],
  };
}

// Último item enviado ao modelo na chamada `index` (o resultado de ferramenta mais recente).
function lastInputItem(create: jest.Mock, index: number) {
  const input = create.mock.calls[index][0].input as Record<string, unknown>[];
  return input[input.length - 1];
}

function makeService(repo: AiRepository, client: OpenAI) {
  const stores = { findByUserId: jest.fn().mockResolvedValue(STORE) };
  return new AiService(repo, stores as never, () => client);
}

describe('AiService.chat', () => {
  it('responde sem ferramentas e grava a mensagem da usuária e a resposta', async () => {
    const repo = makeRepository();
    const { client, create } = makeClient([textReply('Oi! Como posso ajudar?')]);

    const result = await makeService(repo, client).chat('user-1', { message: 'Oi' });

    expect(result).toEqual({
      conversationId: 'conv-1',
      message: 'Oi! Como posso ajudar?',
      cards: [],
      pendingActions: [],
    });
    expect(create).toHaveBeenCalledTimes(1);
    const saved = repo.appendMessages.mock.calls[0][1];
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ role: 'user', turnStart: true });
    expect(saved[1]).toMatchObject({ role: 'assistant' });
  });

  it('executa ferramenta de leitura, devolve o resultado ao modelo e repassa os cartões', async () => {
    const card = {
      type: 'stock_product',
      storeProductId: 'sp-1',
      name: 'Una',
      brand: 'Natura',
      image: null,
      stock: 0,
      minStock: 2,
      price: 99,
      costPrice: null,
    };
    readRun.mockResolvedValue({ data: { total: 1 }, cards: [card] });
    const repo = makeRepository();
    const { client, create } = makeClient([
      toolReply('read_thing'),
      textReply('Você tem 1 em falta.'),
    ]);

    const result = await makeService(repo, client).chat('user-1', { message: 'O que falta?' });

    expect(result.message).toBe('Você tem 1 em falta.');
    expect(result.cards).toEqual([card]);
    // O contexto da ferramenta vem da loja da usuária, nunca do modelo.
    expect(readRun).toHaveBeenCalledWith(
      { userId: 'user-1', storeId: 'store-1', conversationId: 'conv-1' },
      {},
    );

    // 2ª chamada ao modelo leva o resultado da ferramenta, ligado pelo call_id.
    expect(lastInputItem(create, 1)).toMatchObject({
      type: 'function_call_output',
      call_id: 'tu_1',
      output: JSON.stringify({ total: 1 }),
    });

    // Histórico gravado: user, assistant(function_call), tool(resultado), assistant(texto) — sem
    // itens de raciocínio, e sem guardar nada na OpenAI.
    const saved = repo.appendMessages.mock.calls[0][1];
    expect(saved.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(JSON.stringify(saved)).not.toContain('reasoning');
    expect(create.mock.calls[0][0]).toMatchObject({ store: false, model: 'gpt-6-luna' });
  });

  it('erro de regra de negócio numa ferramenta volta ao modelo como erro no function_call_output', async () => {
    readRun.mockRejectedValue(new AppError('Período inválido.', 400));
    const repo = makeRepository();
    const { client, create } = makeClient([toolReply('read_thing'), textReply('Não deu.')]);

    await makeService(repo, client).chat('user-1', { message: 'x' });

    expect(lastInputItem(create, 1)).toMatchObject({
      type: 'function_call_output',
      output: JSON.stringify({ error: 'Período inválido.' }),
    });
  });

  it('ferramenta desconhecida não derruba a conversa', async () => {
    const repo = makeRepository();
    const { client, create } = makeClient([toolReply('nao_existe'), textReply('Ok.')]);

    const result = await makeService(repo, client).chat('user-1', { message: 'x' });

    expect(result.message).toBe('Ok.');
    expect(String(lastInputItem(create, 1).output)).toContain('Ferramenta desconhecida');
  });

  it('ferramenta de escrita só PROPÕE: cria a ação pendente e não executa nada', async () => {
    writePrepare.mockResolvedValue({
      summary: 'Fazer a coisa',
      preview: { name: 'X' },
      payload: { a: 1 },
    });
    const repo = makeRepository({ createAction: jest.fn().mockResolvedValue(actionRow()) });
    const { client, create } = makeClient([toolReply('propose_thing'), textReply('Confirma?')]);

    const result = await makeService(repo, client).chat('user-1', { message: 'faz' });

    expect(writeApply).not.toHaveBeenCalled();
    expect(repo.createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        conversationId: 'conv-1',
        tool: 'propose_thing',
      }),
    );
    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions[0]).toMatchObject({ id: 'act-1', status: 'pending' });

    expect(String(lastInputItem(create, 1).output)).toContain('awaiting_confirmation');
  });

  it('a mesma proposta repetida reaproveita a ação que já está pendente', async () => {
    writePrepare.mockResolvedValue({ summary: 'Fazer a coisa', preview: {}, payload: { a: 1 } });
    const repo = makeRepository({
      findPendingByHash: jest.fn().mockResolvedValue(actionRow()),
      createAction: jest.fn(),
    });
    const { client } = makeClient([toolReply('propose_thing'), textReply('Confirma?')]);

    const result = await makeService(repo, client).chat('user-1', { message: 'faz' });

    expect(repo.createAction).not.toHaveBeenCalled();
    expect(result.pendingActions.map((action) => action.id)).toEqual(['act-1']);
  });

  it('conversa de outra loja responde 404 e não chama o modelo', async () => {
    const repo = makeRepository({ findConversation: jest.fn().mockResolvedValue(null) });
    const { client, create } = makeClient([]);

    await expect(
      makeService(repo, client).chat('user-1', {
        conversationId: '3f1c6d2e-6a53-4d1d-9a89-1d8a2c3b4f5a',
        message: 'oi',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(repo.findConversation).toHaveBeenCalledWith(
      'store-1',
      '3f1c6d2e-6a53-4d1d-9a89-1d8a2c3b4f5a',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('no limite de rodadas fecha o turno sem deixar function_call sem resposta', async () => {
    readRun.mockResolvedValue({ data: {} });
    const repo = makeRepository();
    // Mais respostas com ferramenta do que o limite de rodadas permite.
    const { client, create } = makeClient(
      Array.from({ length: 12 }, (_, i) => toolReply('read_thing', {}, `tu_${i}`)),
    );

    const result = await makeService(repo, client).chat('user-1', { message: 'x' });

    expect(create.mock.calls.length).toBeLessThanOrEqual(12);
    expect(result.message).toContain('Não consegui concluir');
    const saved = repo.appendMessages.mock.calls[0][1] as { role: string }[];
    expect(saved[saved.length - 1].role).toBe('assistant');
  });

  it('se o modelo falha na primeira mensagem, a conversa nova não fica vazia no banco', async () => {
    const repo = makeRepository();
    const client = {
      responses: { create: jest.fn().mockRejectedValue(new Error('boom')) },
    } as unknown as OpenAI;

    await expect(makeService(repo, client).chat('user-1', { message: 'oi' })).rejects.toThrow(
      'boom',
    );

    expect(repo.deleteConversation).toHaveBeenCalledWith('conv-1');
    expect(repo.appendMessages).not.toHaveBeenCalled();
  });

  it('recusa do modelo vira uma mensagem amigável (nunca resposta vazia)', async () => {
    const repo = makeRepository();
    const { client } = makeClient([
      {
        status: 'completed',
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'no' }] },
        ],
      },
    ]);

    const result = await makeService(repo, client).chat('user-1', { message: 'x' });

    expect(result.message).toContain('Não consigo ajudar');
  });
});

describe('AiService.confirmAction', () => {
  beforeEach(() => {
    writeApply.mockResolvedValue({ storeProductId: 'sp-9' });
  });

  it('executa uma vez, grava o resultado e avisa a conversa', async () => {
    const repo = makeRepository({ findAction: jest.fn().mockResolvedValue(actionRow()) });
    const service = makeService(repo, makeClient([]).client);

    const view = await service.confirmAction('user-1', 'act-1');

    expect(repo.findAction).toHaveBeenCalledWith('store-1', 'act-1');
    expect(writeApply).toHaveBeenCalledTimes(1);
    expect(writeApply).toHaveBeenCalledWith(
      { userId: 'user-1', storeId: 'store-1', conversationId: 'conv-1' },
      { a: 1 },
    );
    expect(repo.finishAction).toHaveBeenCalledWith('act-1', 'executed', {
      result: { storeProductId: 'sp-9' },
    });
    expect(view.status).toBe('executed');
    expect(repo.appendMessages).toHaveBeenCalled();
  });

  it('confirmar de novo uma operação já executada não executa outra vez', async () => {
    const repo = makeRepository({
      findAction: jest
        .fn()
        .mockResolvedValue(actionRow({ status: 'executed', result: { ok: true } })),
    });

    const view = await makeService(repo, makeClient([]).client).confirmAction('user-1', 'act-1');

    expect(view.status).toBe('executed');
    expect(writeApply).not.toHaveBeenCalled();
    expect(repo.claimForExecution).not.toHaveBeenCalled();
  });

  it('duas confirmações simultâneas: quem perde a corrida não executa', async () => {
    const repo = makeRepository({
      findAction: jest
        .fn()
        .mockResolvedValueOnce(actionRow())
        .mockResolvedValueOnce(actionRow({ status: 'executing' })),
      claimForExecution: jest.fn().mockResolvedValue(false),
    });

    await expect(
      makeService(repo, makeClient([]).client).confirmAction('user-1', 'act-1'),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(writeApply).not.toHaveBeenCalled();
  });

  it('operação expirada não executa', async () => {
    const repo = makeRepository({
      findAction: jest
        .fn()
        .mockResolvedValue(actionRow({ expiresAt: new Date(Date.now() - 1000) })),
    });

    await expect(
      makeService(repo, makeClient([]).client).confirmAction('user-1', 'act-1'),
    ).rejects.toMatchObject({
      code: 'AI_ACTION_EXPIRED',
    });
    expect(repo.expirePending).toHaveBeenCalledWith('store-1', 'act-1');
    expect(writeApply).not.toHaveBeenCalled();
  });

  it('operação cancelada não pode ser confirmada', async () => {
    const repo = makeRepository({
      findAction: jest.fn().mockResolvedValue(actionRow({ status: 'cancelled' })),
    });

    await expect(
      makeService(repo, makeClient([]).client).confirmAction('user-1', 'act-1'),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(writeApply).not.toHaveBeenCalled();
  });

  it('ação de outra loja responde 404 (a busca é sempre pela loja da usuária)', async () => {
    const repo = makeRepository({ findAction: jest.fn().mockResolvedValue(null) });

    await expect(
      makeService(repo, makeClient([]).client).confirmAction('user-1', 'act-de-outra'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.findAction).toHaveBeenCalledWith('store-1', 'act-de-outra');
    expect(writeApply).not.toHaveBeenCalled();
  });

  it('falha na execução marca a ação como failed e repassa o erro de regra de negócio', async () => {
    writeApply.mockRejectedValue(
      new AppError('Limite do plano atingido.', 403, 'PLAN_LIMIT_REACHED'),
    );
    const repo = makeRepository({ findAction: jest.fn().mockResolvedValue(actionRow()) });

    await expect(
      makeService(repo, makeClient([]).client).confirmAction('user-1', 'act-1'),
    ).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
    expect(repo.finishAction).toHaveBeenCalledWith('act-1', 'failed', {
      error: 'Limite do plano atingido.',
    });
  });
});

describe('AiService.cancelAction', () => {
  it('cancela uma operação pendente', async () => {
    const repo = makeRepository({ findAction: jest.fn().mockResolvedValue(actionRow()) });

    const view = await makeService(repo, makeClient([]).client).cancelAction('user-1', 'act-1');

    expect(repo.cancelPending).toHaveBeenCalledWith('store-1', 'act-1');
    expect(view.status).toBe('cancelled');
  });

  it('não cancela o que já foi executado', async () => {
    const repo = makeRepository({
      findAction: jest.fn().mockResolvedValue(actionRow({ status: 'executed' })),
      cancelPending: jest.fn().mockResolvedValue(false),
    });

    await expect(
      makeService(repo, makeClient([]).client).cancelAction('user-1', 'act-1'),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
