import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  buildTestSession,
  signTestAccessToken,
  signTestRefreshToken,
} from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const sessionUpsert = jest.fn();
const sessionDeleteMany = jest.fn();
const userFindUnique = jest.fn();
const userCreate = jest.fn();
const userUpdate = jest.fn();
const otpCodeCreate = jest.fn();
const storeFindUnique = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: {
      findUnique: (...args: unknown[]) => sessionFindUnique(...args),
      upsert: (...args: unknown[]) => sessionUpsert(...args),
      deleteMany: (...args: unknown[]) => sessionDeleteMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    otpCode: {
      create: (...args: unknown[]) => otpCodeCreate(...args),
    },
    store: {
      findUnique: (...args: unknown[]) => storeFindUnique(...args),
    },
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

beforeEach(() => {
  sessionFindUnique.mockReset();
  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  sessionUpsert.mockReset();
  sessionUpsert.mockResolvedValue(buildTestSession(USER_ID));
  sessionDeleteMany.mockReset();
  sessionDeleteMany.mockResolvedValue({ count: 1 });
});

describe('POST /auth/register', () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    userCreate.mockReset();
    otpCodeCreate.mockReset();
  });

  it('cria a conta, dispara o OTP e retorna isVerified/hasStore como false', async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockImplementation(({ data }) =>
      Promise.resolve({
        id: USER_ID,
        ...data,
        phoneVerifiedAt: null,
        createdAt: new Date(),
      }),
    );
    otpCodeCreate.mockResolvedValue({
      id: 'otp-1',
      userId: USER_ID,
      codeHash: 'hash',
      expiresAt: new Date(),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Ana Souza',
        email: 'ana@email.com',
        whatsapp: '5511982214432',
        password: '123456',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.isVerified).toBe(false);
    expect(body.hasStore).toBe(false);
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(otpCodeCreate).toHaveBeenCalledTimes(1);
    expect(sessionUpsert).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('retorna 409 quando o e-mail já existe', async () => {
    userFindUnique.mockResolvedValueOnce({
      id: USER_ID,
      name: 'Ana',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: null,
      createdAt: new Date(),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Ana Souza',
        email: 'ana@email.com',
        whatsapp: '5511982214432',
        password: '123456',
      },
    });

    expect(response.statusCode).toBe(409);

    await app.close();
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    storeFindUnique.mockReset();
  });

  it('retorna 200, tokens e hasStore true quando o usuário já tem loja', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana Souza',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: await bcrypt.hash('123456', 4),
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    storeFindUnique.mockResolvedValue({
      id: 'store-1',
      userId: USER_ID,
      storeName: 'Leal Perfumaria',
      handle: 'lealperfumaria',
      catalogLink: 'https://lealperfumaria.revendaja.com',
      isOnline: true,
      createdAt: new Date(),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana@email.com', password: '123456' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isVerified).toBe(true);
    expect(body.hasStore).toBe(true);

    // Sessão única: o login grava/substitui a sessão da usuária (upsert por userId).
    expect(sessionUpsert).toHaveBeenCalledTimes(1);
    expect(sessionUpsert.mock.calls[0][0].where).toEqual({ userId: USER_ID });

    await app.close();
  });

  it('retorna 401 quando a senha está incorreta', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana Souza',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: await bcrypt.hash('123456', 4),
      phoneVerifiedAt: null,
      createdAt: new Date(),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana@email.com', password: 'senha-errada' },
    });

    expect(response.statusCode).toBe(401);
    expect(sessionUpsert).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('GET /me', () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    storeFindUnique.mockReset();
  });

  it('retorna 401 sem token', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/me' });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('retorna o usuário, isVerified e a loja (null) com token válido', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana Souza',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: null,
      createdAt: new Date(),
    });
    storeFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isVerified).toBe(false);
    expect(body.store).toBeNull();

    await app.close();
  });
});

describe('PATCH /me', () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    userUpdate.mockReset();
  });

  function buildUserRow(overrides: Record<string, unknown> = {}) {
    return {
      id: USER_ID,
      name: 'Ana Souza',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('retorna 401 sem token', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/me',
      payload: { name: 'Nova Ana' },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('retorna 400 quando nem name nem whatsapp são enviados', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();

    await app.close();
  });

  it('atualiza o nome e devolve o usuário público (sem passwordHash)', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());
    userUpdate.mockResolvedValue(buildUserRow({ name: 'Ana Nova' }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
      payload: { name: 'Ana Nova' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      id: USER_ID,
      name: 'Ana Nova',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
    });
    expect(userUpdate.mock.calls[0][0].data).toEqual({ name: 'Ana Nova' });

    await app.close();
  });

  it('409 quando o novo whatsapp já é de outra conta', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());
    userUpdate.mockRejectedValue({ code: 'P2002' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
      payload: { whatsapp: '5511900000000' },
    });

    expect(response.statusCode).toBe(409);

    await app.close();
  });
});

describe('sessão única (middleware authenticate)', () => {
  function requestMe(token: string) {
    return buildApp().then(async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
      });
      await app.close();
      return response;
    });
  }

  beforeEach(() => {
    userFindUnique.mockReset();
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana Souza',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: null,
      createdAt: new Date(),
    });
    storeFindUnique.mockReset();
    storeFindUnique.mockResolvedValue(null);
  });

  it('recusa o token quando a sessão foi substituída por um login em outro aparelho', async () => {
    // A sessão vigente no banco tem outro id: o token antigo carrega o sid antigo.
    sessionFindUnique.mockResolvedValue(null);

    const response = await requestMe(signTestAccessToken(USER_ID));

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toMatch(/sessão encerrada/i);
  });

  it('recusa o token de uma sessão que pertence a outra usuária', async () => {
    sessionFindUnique.mockResolvedValue(buildTestSession('outra-usuaria'));

    const response = await requestMe(signTestAccessToken(USER_ID));

    expect(response.statusCode).toBe(401);
  });

  it('recusa o token quando a sessão já expirou', async () => {
    sessionFindUnique.mockResolvedValue(
      buildTestSession(USER_ID, { expiresAt: new Date(Date.now() - 1000) }),
    );

    const response = await requestMe(signTestAccessToken(USER_ID));

    expect(response.statusCode).toBe(401);
  });

  it('recusa tokens antigos, emitidos sem sessão (sem sid)', async () => {
    const legacyToken = jwt.sign({ sub: USER_ID }, process.env.JWT_SECRET as string, {
      expiresIn: '15m',
    });

    const response = await requestMe(legacyToken);

    expect(response.statusCode).toBe(401);
    expect(sessionFindUnique).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  it('retorna 401 sem token', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/auth/logout' });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('apaga a sessão atual', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ loggedOut: true });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { id: buildTestSession(USER_ID).id } });

    await app.close();
  });
});

describe('POST /auth/refresh', () => {
  async function postRefresh(payload: Record<string, unknown>) {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/auth/refresh', payload });
    await app.close();
    return response;
  }

  it('troca o refresh token por um novo access token, sem exigir Authorization', async () => {
    const response = await postRefresh({ refreshToken: signTestRefreshToken(USER_ID) });

    expect(response.statusCode).toBe(200);
    const { accessToken, ...rest } = response.json();
    expect(rest).toEqual({});
    const payload = jwt.verify(accessToken, process.env.JWT_SECRET as string) as jwt.JwtPayload;
    expect(payload.sub).toBe(USER_ID);
    expect(payload.sid).toBe(buildTestSession(USER_ID).id);
    // Mesma sessão: nada é criado/substituído.
    expect(sessionUpsert).not.toHaveBeenCalled();
  });

  it('o access token novo é aceito pelas rotas autenticadas', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana Souza',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: null,
      createdAt: new Date(),
    });
    storeFindUnique.mockResolvedValue(null);

    const refreshed = await postRefresh({ refreshToken: signTestRefreshToken(USER_ID) });
    const app = await buildApp();
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${refreshed.json().accessToken}` },
    });
    await app.close();

    expect(me.statusCode).toBe(200);
  });

  it('retorna 401 quando o refresh token é, na verdade, um access token', async () => {
    const response = await postRefresh({ refreshToken: signTestAccessToken(USER_ID) });

    expect(response.statusCode).toBe(401);
  });

  it('retorna 401 para token inválido', async () => {
    const response = await postRefresh({ refreshToken: 'lixo' });

    expect(response.statusCode).toBe(401);
  });

  it('retorna 401 "sessão encerrada" quando a sessão foi trocada por um login em outro aparelho', async () => {
    sessionFindUnique.mockResolvedValue(null);

    const response = await postRefresh({ refreshToken: signTestRefreshToken(USER_ID) });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toMatch(/sessão encerrada/i);
  });

  it('retorna 400 quando falta o refreshToken no body', async () => {
    const response = await postRefresh({});

    expect(response.statusCode).toBe(400);
  });
});
