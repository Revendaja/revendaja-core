import bcrypt from 'bcryptjs';
import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const userUpdate = jest.fn();
const otpCodeFindFirst = jest.fn();
const otpCodeUpdate = jest.fn();
const otpCodeCount = jest.fn();
const otpCodeUpdateMany = jest.fn();
const otpCodeCreate = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: {
      findUnique: (...args: unknown[]) => sessionFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    otpCode: {
      findFirst: (...args: unknown[]) => otpCodeFindFirst(...args),
      update: (...args: unknown[]) => otpCodeUpdate(...args),
      count: (...args: unknown[]) => otpCodeCount(...args),
      updateMany: (...args: unknown[]) => otpCodeUpdateMany(...args),
      create: (...args: unknown[]) => otpCodeCreate(...args),
    },
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const TOKEN = signTestAccessToken(USER_ID);

function buildPendingOtp(overrides: Record<string, unknown> = {}) {
  return {
    id: 'otp-1',
    userId: USER_ID,
    codeHash: 'placeholder',
    expiresAt: new Date(Date.now() + 10 * 60_000),
    attempts: 0,
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  sessionFindUnique.mockReset();
  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  userFindUnique.mockReset();
  userUpdate.mockReset();
  otpCodeFindFirst.mockReset();
  otpCodeUpdate.mockReset();
  otpCodeCount.mockReset();
  otpCodeUpdateMany.mockReset();
  otpCodeCreate.mockReset();
});

describe('POST /auth/otp/verify', () => {
  it('retorna 401 sem token', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { code: '123456' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('confirma o código correto e verifica o usuário', async () => {
    otpCodeFindFirst.mockResolvedValue(
      buildPendingOtp({ codeHash: await bcrypt.hash('123456', 4) }),
    );
    otpCodeUpdateMany.mockResolvedValue({ count: 1 });
    userUpdate.mockResolvedValue({
      id: USER_ID,
      name: 'Ana',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { code: '123456' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ isVerified: true });
    expect(userUpdate).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('retorna 401 quando o código está errado', async () => {
    otpCodeFindFirst.mockResolvedValue(
      buildPendingOtp({ codeHash: await bcrypt.hash('123456', 4) }),
    );
    otpCodeUpdateMany.mockResolvedValue({ count: 1 });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { code: '000000' },
    });

    expect(response.statusCode).toBe(401);
    // A tentativa é reservada (updateMany) ANTES de comparar o código — não usa mais `update`.
    expect(otpCodeUpdateMany).toHaveBeenCalledTimes(1);
    expect(otpCodeUpdate).not.toHaveBeenCalled();

    await app.close();
  });

  it('retorna 400 OTP_MAX_ATTEMPTS_REACHED quando o claim atômico recusa (sem tentativas sobrando)', async () => {
    otpCodeFindFirst.mockResolvedValue(
      buildPendingOtp({ codeHash: await bcrypt.hash('123456', 4), attempts: 5 }),
    );
    otpCodeUpdateMany.mockResolvedValue({ count: 0 });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { code: '123456' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('OTP_MAX_ATTEMPTS_REACHED');

    await app.close();
  });
});

describe('POST /auth/otp/resend', () => {
  it('retorna 429 durante o cooldown', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: null,
      createdAt: new Date(),
    });
    otpCodeFindFirst.mockResolvedValue(buildPendingOtp({ createdAt: new Date() }));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/resend',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(429);

    await app.close();
  });

  it('gera e envia um novo código quando fora do cooldown e do limite', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: null,
      createdAt: new Date(),
    });
    otpCodeFindFirst.mockResolvedValue(
      buildPendingOtp({ createdAt: new Date(Date.now() - 60 * 60_000) }),
    );
    otpCodeCount.mockResolvedValue(0);
    otpCodeUpdateMany.mockResolvedValue({ count: 1 });
    otpCodeCreate.mockResolvedValue(buildPendingOtp());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/resend',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: true });
    expect(otpCodeUpdateMany).toHaveBeenCalledTimes(1);
    expect(otpCodeCreate).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
