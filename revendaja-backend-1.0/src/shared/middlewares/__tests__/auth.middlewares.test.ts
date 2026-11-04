import type { FastifyRequest } from 'fastify';
import { signTestAccessToken } from '../../../../test/helpers/token';
import type { User } from '../../../modules/users/users.types';

const findByIdWithUser = jest.fn();
const findUserById = jest.fn();

jest.mock('../../../modules/sessions/sessions.repository', () => ({
  sessionsRepository: { findByIdWithUser: (...args: unknown[]) => findByIdWithUser(...args) },
}));
jest.mock('../../../modules/users/users.repository', () => ({
  usersRepository: { findById: (...args: unknown[]) => findUserById(...args) },
}));

import { authenticate } from '../authenticate';
import { requireAdmin } from '../requireAdmin';
import { requireVerified } from '../requireVerified';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const SESSION_ID = 'a3b1c9d8-2e4f-4a6b-8c1d-3e5f7a9b0c1d';

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    name: 'Ana',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    googleId: null,
    phoneVerifiedAt: new Date(),
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    user: user(),
    ...overrides,
  };
}

function requestWithToken(token = signTestAccessToken(USER_ID, SESSION_ID)) {
  return { headers: { authorization: `Bearer ${token}` } } as unknown as FastifyRequest;
}

const reply = {} as never;

beforeEach(() => {
  findByIdWithUser.mockReset();
  findUserById.mockReset();
});

describe('authenticate', () => {
  it('busca a sessão e a usuária numa consulta só e deixa a usuária no pedido', async () => {
    findByIdWithUser.mockResolvedValue(session());
    const request = requestWithToken();

    await authenticate(request, reply);

    expect(findByIdWithUser).toHaveBeenCalledTimes(1);
    expect(findByIdWithUser).toHaveBeenCalledWith(SESSION_ID);
    expect(request.userId).toBe(USER_ID);
    expect(request.sessionId).toBe(SESSION_ID);
    expect(request.authUser?.email).toBe('ana@email.com');
  });

  it('recusa sessão que não existe mais (login em outro aparelho, logout)', async () => {
    findByIdWithUser.mockResolvedValue(null);
    await expect(authenticate(requestWithToken(), reply)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('recusa sessão expirada e sessão de outra usuária', async () => {
    findByIdWithUser.mockResolvedValue(session({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(authenticate(requestWithToken(), reply)).rejects.toMatchObject({
      statusCode: 401,
    });

    findByIdWithUser.mockResolvedValue(session({ userId: 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7' }));
    await expect(authenticate(requestWithToken(), reply)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('recusa sem token, com token inválido e token sem sessão (sid)', async () => {
    await expect(authenticate({ headers: {} } as FastifyRequest, reply)).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(authenticate(requestWithToken('lixo'), reply)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(findByIdWithUser).not.toHaveBeenCalled();
  });
});

describe('requireVerified', () => {
  const check = requireVerified();

  it('usa a usuária que veio com a sessão, sem ir ao banco de novo', async () => {
    const request = { userId: USER_ID, authUser: user() } as FastifyRequest;
    await expect(check(request, reply)).resolves.toBeUndefined();
    expect(findUserById).not.toHaveBeenCalled();
  });

  it('recusa quem ainda não verificou o e-mail', async () => {
    const request = {
      userId: USER_ID,
      authUser: user({ phoneVerifiedAt: null }),
    } as FastifyRequest;
    await expect(check(request, reply)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('sem a usuária carregada, busca no banco (caminho de reserva)', async () => {
    findUserById.mockResolvedValue(user());
    await expect(check({ userId: USER_ID } as FastifyRequest, reply)).resolves.toBeUndefined();
    expect(findUserById).toHaveBeenCalledWith(USER_ID);

    findUserById.mockResolvedValue(user({ phoneVerifiedAt: null }));
    await expect(check({ userId: USER_ID } as FastifyRequest, reply)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('requireAdmin', () => {
  it('libera admin e recusa conta comum, usando a usuária que veio com a sessão', async () => {
    await expect(
      requireAdmin({ userId: USER_ID, authUser: user({ role: 'admin' }) } as FastifyRequest, reply),
    ).resolves.toBeUndefined();
    await expect(
      requireAdmin({ userId: USER_ID, authUser: user() } as FastifyRequest, reply),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findUserById).not.toHaveBeenCalled();
  });

  it('sem a usuária carregada, busca no banco (caminho de reserva)', async () => {
    findUserById.mockResolvedValue(user({ role: 'admin' }));
    await expect(
      requireAdmin({ userId: USER_ID } as FastifyRequest, reply),
    ).resolves.toBeUndefined();
    expect(findUserById).toHaveBeenCalledWith(USER_ID);
  });
});
