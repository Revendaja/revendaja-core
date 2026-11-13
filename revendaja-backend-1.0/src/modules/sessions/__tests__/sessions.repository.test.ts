const queryRaw = jest.fn();

const tx = {
  session: { deleteMany: jest.fn(), create: jest.fn(), findMany: jest.fn() },
};

jest.mock('../../../database/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { sessionsRepository } from '../sessions.repository';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const SESSION_ID = 'a3b1c9d8-2e4f-4a6b-8c1d-3e5f7a9b0c1d';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    expires_at: new Date('2026-12-01T00:00:00Z'),
    created_at: new Date('2026-11-01T00:00:00Z'),
    name: 'Ana',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    password_hash: 'hash',
    google_id: null,
    phone_verified_at: new Date('2026-11-01T01:00:00Z'),
    role: 'admin',
    user_created_at: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => queryRaw.mockReset());

describe('sessionsRepository.findByIdWithUser', () => {
  it('traz a sessão e a usuária numa consulta só, com os campos no formato do app', async () => {
    queryRaw.mockResolvedValue([row()]);

    const result = await sessionsRepository.findByIdWithUser(SESSION_ID);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: SESSION_ID,
      userId: USER_ID,
      expiresAt: new Date('2026-12-01T00:00:00Z'),
      createdAt: new Date('2026-11-01T00:00:00Z'),
      user: {
        id: USER_ID,
        name: 'Ana',
        email: 'ana@email.com',
        whatsapp: '5511982214432',
        passwordHash: 'hash',
        googleId: null,
        phoneVerifiedAt: new Date('2026-11-01T01:00:00Z'),
        role: 'admin',
        createdAt: new Date('2026-10-01T00:00:00Z'),
      },
    });
  });

  it('mantém o que é opcional como nulo (conta sem senha, sem WhatsApp, sem verificação)', async () => {
    queryRaw.mockResolvedValue([
      row({ whatsapp: null, password_hash: null, phone_verified_at: null, role: 'user' }),
    ]);

    const result = await sessionsRepository.findByIdWithUser(SESSION_ID);

    expect(result?.user).toMatchObject({
      whatsapp: null,
      passwordHash: null,
      phoneVerifiedAt: null,
      role: 'user',
    });
  });

  it('devolve null quando a sessão não existe', async () => {
    queryRaw.mockResolvedValue([]);
    await expect(sessionsRepository.findByIdWithUser(SESSION_ID)).resolves.toBeNull();
  });
});

describe('sessionsRepository.replaceForUser', () => {
  beforeEach(() => {
    tx.session.deleteMany.mockReset();
    tx.session.create.mockReset();
    tx.session.findMany.mockReset();
  });

  it('mobile: mantém as mais recentes (vários aparelhos) e apaga só o excedente', async () => {
    tx.session.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await sessionsRepository.replaceForUser(USER_ID, SESSION_ID, new Date(), 'mobile');

    expect(tx.session.create).toHaveBeenCalledTimes(1);
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, client: 'mobile', id: { notIn: ['a', 'b'] } },
    });
  });

  it('web: apaga a sessão web anterior antes de criar a nova', async () => {
    await sessionsRepository.replaceForUser(USER_ID, SESSION_ID, new Date(), 'web');

    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, client: 'web' },
    });
    expect(tx.session.findMany).not.toHaveBeenCalled();
  });
});
