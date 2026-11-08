import bcrypt from 'bcryptjs';
import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const userDelete = jest.fn();
const storeFindUnique = jest.fn();
const saleItemFindMany = jest.fn();
const componentDeleteMany = jest.fn();

const prismaMock = {
  $queryRaw: async (...args: unknown[]) =>
    sessionHelpers.emulateSessionJoin(sessionFindUnique, userFindUnique, args),
  session: { findUnique: (...args: unknown[]) => sessionFindUnique(...args) },
  user: {
    findUnique: (...args: unknown[]) => userFindUnique(...args),
    delete: (...args: unknown[]) => userDelete(...args),
  },
  store: { findUnique: (...args: unknown[]) => storeFindUnique(...args) },
  saleItem: { findMany: (...args: unknown[]) => saleItemFindMany(...args) },
  storeProductComponent: { deleteMany: (...args: unknown[]) => componentDeleteMany(...args) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
};

jest.mock('../../../database/prisma', () => ({
  prisma: prismaMock,
}));

import * as sessionHelpers from '../../../../test/helpers/session';
import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

async function userRow() {
  return {
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: await bcrypt.hash('senha-correta', 4),
    googleId: null,
    phoneVerifiedAt: new Date(),
    role: 'user',
    createdAt: new Date(),
  };
}

beforeEach(async () => {
  [
    sessionFindUnique,
    userFindUnique,
    userDelete,
    storeFindUnique,
    saleItemFindMany,
    componentDeleteMany,
  ].forEach((mock) => mock.mockReset());
  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  userFindUnique.mockResolvedValue(await userRow());
  storeFindUnique.mockResolvedValue(null);
  saleItemFindMany.mockResolvedValue([]);
  userDelete.mockResolvedValue({});
  componentDeleteMany.mockResolvedValue({ count: 0 });
});

describe('DELETE /me', () => {
  it('401 sem token', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/me',
      payload: { password: 'senha-correta' },
    });

    expect(response.statusCode).toBe(401);
    expect(userDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it('400 sem senha nem token do Google', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(userDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it('401 com senha errada e não apaga', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
      payload: { password: 'errada' },
    });

    expect(response.statusCode).toBe(401);
    expect(userDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it('200 com a senha certa: apaga a conta', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${signTestAccessToken(USER_ID)}` },
      payload: { password: 'senha-correta' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    await app.close();
  });
});
