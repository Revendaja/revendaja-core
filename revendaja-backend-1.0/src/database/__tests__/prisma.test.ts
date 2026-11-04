const poolQuery = jest.fn();
// O pool é criado quando o módulo carrega, antes de qualquer teste; o `clearMocks` do Jest apagaria as
// chamadas registradas em jest.fn(), então o que importa é guardado numa variável comum.
const captured: {
  options?: Record<string, unknown>;
  handlers: Record<string, (e: Error) => void>;
} = {
  handlers: {},
};
const prismaConnect = jest.fn();
const loggerWarn = jest.fn();

jest.mock('pg', () => ({
  Pool: function Pool(this: unknown, options: unknown) {
    captured.options = options as Record<string, unknown>;
    return {
      query: (...args: unknown[]) => poolQuery(...args),
      on: (event: string, handler: (e: Error) => void) => {
        captured.handlers[event] = handler;
      },
    };
  },
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: function PrismaPg() {} }));
jest.mock('@prisma/client', () => ({
  PrismaClient: function PrismaClient() {
    return {
      $connect: (...args: unknown[]) => prismaConnect(...args),
      $disconnect: jest.fn(),
    };
  },
}));
jest.mock('../../shared/logger', () => ({
  logger: { warn: (...args: unknown[]) => loggerWarn(...args), info: jest.fn(), error: jest.fn() },
}));

import { connectDatabase } from '../prisma';

beforeEach(() => {
  poolQuery.mockReset().mockResolvedValue({ rows: [] });
  prismaConnect.mockReset().mockResolvedValue(undefined);
  loggerWarn.mockReset();
});

describe('pool de conexões com o banco', () => {
  it('mantém conexões abertas por 5 minutos e nunca fecha as últimas, com keepAlive', () => {
    expect(captured.options).toMatchObject({
      idleTimeoutMillis: 5 * 60_000,
      min: 4,
      keepAlive: true,
    });
  });

  it('descarta conexão ociosa derrubada pelo banco sem derrubar o processo', () => {
    const errorHandler = captured.handlers.error;
    expect(errorHandler).toEqual(expect.any(Function));
    expect(() => errorHandler(new Error('connection terminated'))).not.toThrow();
  });
});

describe('connectDatabase (aquecimento ao ligar o servidor)', () => {
  it('conecta o Prisma e abre 4 conexões ao mesmo tempo', async () => {
    await connectDatabase();

    expect(prismaConnect).toHaveBeenCalledTimes(1);
    expect(poolQuery).toHaveBeenCalledTimes(4);
    expect(poolQuery).toHaveBeenCalledWith('SELECT 1');
  });

  it('as 4 consultas de aquecimento saem juntas (não uma depois da outra)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    poolQuery.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { rows: [] };
    });

    await connectDatabase();

    expect(maxInFlight).toBe(4);
  });

  it('se o aquecimento falhar, o servidor sobe do mesmo jeito e só registra um aviso', async () => {
    poolQuery.mockRejectedValue(new Error('banco indisponível'));

    await expect(connectDatabase()).resolves.toBeUndefined();
    expect(loggerWarn).toHaveBeenCalledWith({ failed: 4 }, expect.stringContaining('aquecimento'));
  });
});
