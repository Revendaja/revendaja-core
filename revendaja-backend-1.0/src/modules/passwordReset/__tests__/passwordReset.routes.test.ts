import bcrypt from 'bcryptjs';

const userFindUnique = jest.fn();
const userUpdate = jest.fn();
const resetFindFirst = jest.fn();
const resetCount = jest.fn();
const resetCreate = jest.fn();
const resetUpdateMany = jest.fn();
const sessionDeleteMany = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    passwordResetCode: {
      findFirst: (...args: unknown[]) => resetFindFirst(...args),
      count: (...args: unknown[]) => resetCount(...args),
      create: (...args: unknown[]) => resetCreate(...args),
      updateMany: (...args: unknown[]) => resetUpdateMany(...args),
    },
    session: {
      deleteMany: (...args: unknown[]) => sessionDeleteMany(...args),
    },
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function buildUserRow() {
  return {
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    createdAt: new Date(),
  };
}

async function buildCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reset-1',
    userId: USER_ID,
    codeHash: await bcrypt.hash('123456', 4),
    expiresAt: new Date(Date.now() + 15 * 60_000),
    attempts: 0,
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

async function post(url: string, payload: Record<string, unknown>) {
  const app = await buildApp();
  const response = await app.inject({ method: 'POST', url, payload });
  await app.close();
  return response;
}

beforeEach(() => {
  [
    userFindUnique,
    userUpdate,
    resetFindFirst,
    resetCount,
    resetCreate,
    resetUpdateMany,
    sessionDeleteMany,
  ].forEach((mock) => mock.mockReset());
});

describe('POST /auth/forgot-password', () => {
  it('responde 200 { sent: true } para e-mail sem conta, sem criar código', async () => {
    userFindUnique.mockResolvedValue(null);

    const response = await post('/auth/forgot-password', { email: 'ninguem@email.com' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: true });
    expect(resetCreate).not.toHaveBeenCalled();
  });

  it('responde a MESMA coisa para e-mail com conta e cria o código (só o hash)', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());
    resetFindFirst.mockResolvedValue(null);
    resetCount.mockResolvedValue(0);
    resetUpdateMany.mockResolvedValue({ count: 0 });
    resetCreate.mockResolvedValue(await buildCodeRow());

    const response = await post('/auth/forgot-password', { email: 'ana@email.com' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: true });
    expect(resetCreate).toHaveBeenCalledTimes(1);
    const { data } = resetCreate.mock.calls[0][0];
    expect(data.userId).toBe(USER_ID);
    expect(data.codeHash).not.toMatch(/^\d{6}$/);
  });

  it('retorna 400 para e-mail inválido', async () => {
    const response = await post('/auth/forgot-password', { email: 'nao-e-email' });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /auth/reset-password', () => {
  const body = { email: 'ana@email.com', code: '123456', password: 'nova-senha' };

  it('retorna 400 PASSWORD_RESET_CODE_INVALID para e-mail sem conta', async () => {
    userFindUnique.mockResolvedValue(null);

    const response = await post('/auth/reset-password', body);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('PASSWORD_RESET_CODE_INVALID');
  });

  it('retorna 400 de validação para código que não tem 6 dígitos', async () => {
    const response = await post('/auth/reset-password', { ...body, code: '12ab56' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('retorna 400 de validação para senha curta demais', async () => {
    const response = await post('/auth/reset-password', { ...body, password: '123' });

    expect(response.statusCode).toBe(400);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('redefine a senha com o código certo, consome o código e encerra a sessão', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());
    resetFindFirst.mockResolvedValue(await buildCodeRow());
    resetUpdateMany.mockResolvedValue({ count: 1 });
    userUpdate.mockResolvedValue(buildUserRow());
    sessionDeleteMany.mockResolvedValue({ count: 1 });

    const response = await post('/auth/reset-password', body);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reset: true });
    // 1ª escrita: reserva atômica da tentativa, com o limite de tentativas no where.
    expect(resetUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: 'reset-1',
      usedAt: null,
      attempts: { lt: 5 },
    });
    expect(userUpdate.mock.calls[0][0].where).toEqual({ id: USER_ID });
    expect(userUpdate.mock.calls[0][0].data.passwordHash).not.toBe('nova-senha');
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it('retorna 400 e NÃO troca a senha com o código errado', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());
    resetFindFirst.mockResolvedValue(await buildCodeRow());
    resetUpdateMany.mockResolvedValue({ count: 1 });

    const response = await post('/auth/reset-password', { ...body, code: '000000' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('PASSWORD_RESET_CODE_INVALID');
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it('retorna 400 mesmo com o código CERTO quando as tentativas se esgotaram', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());
    resetFindFirst.mockResolvedValue(await buildCodeRow({ attempts: 5 }));
    // O UPDATE atômico não encontra linha elegível (attempts já no limite).
    resetUpdateMany.mockResolvedValue({ count: 0 });

    const response = await post('/auth/reset-password', body);

    expect(response.statusCode).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
