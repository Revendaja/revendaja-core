import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    $queryRaw: async (...args: unknown[]) =>
      sessionHelpers.emulateSessionJoin(sessionFindUnique, userFindUnique, args),
    session: { findUnique: (...args: unknown[]) => sessionFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

const overview = jest.fn();
const stores = jest.fn();
const ai = jest.fn();
const plans = jest.fn();
const system = jest.fn();
const latency = jest.fn();

jest.mock('../admin.service', () => ({
  adminService: {
    overview: (...args: unknown[]) => overview(...args),
    stores: (...args: unknown[]) => stores(...args),
    ai: (...args: unknown[]) => ai(...args),
    plans: (...args: unknown[]) => plans(...args),
    system: (...args: unknown[]) => system(...args),
    latency: (...args: unknown[]) => latency(...args),
  },
}));

import * as sessionHelpers from '../../../../test/helpers/session';
import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ADMIN_ID = '6b3c9e2a-1f4d-4b3a-9c1e-8f2a7d6e5b4c';
const USER_SESSION_ID = 'a3b1c9d8-2e4f-4a6b-8c1d-3e5f7a9b0c1d';
const ADMIN_SESSION_ID = 'b4c2d0e9-3f5a-4b7c-9d2e-4f6a8b0c1d2e';
const USER_TOKEN = signTestAccessToken(USER_ID, USER_SESSION_ID);
const ADMIN_TOKEN = signTestAccessToken(ADMIN_ID, ADMIN_SESSION_ID);

function buildUser(id: string, role: 'user' | 'admin') {
  return {
    id,
    name: 'Ana',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    role,
    createdAt: new Date(),
  };
}

beforeEach(() => {
  for (const fn of [
    sessionFindUnique,
    userFindUnique,
    overview,
    stores,
    ai,
    plans,
    system,
    latency,
  ]) {
    fn.mockReset();
  }
  sessionFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    if (where.id === ADMIN_SESSION_ID) {
      return Promise.resolve(buildTestSession(ADMIN_ID, { id: ADMIN_SESSION_ID }));
    }
    if (where.id === USER_SESSION_ID) {
      return Promise.resolve(buildTestSession(USER_ID, { id: USER_SESSION_ID }));
    }
    return Promise.resolve(null);
  });
  userFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(buildUser(where.id, where.id === ADMIN_ID ? 'admin' : 'user')),
  );
  overview.mockResolvedValue({ ok: true });
  stores.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
  ai.mockResolvedValue({ period: '2026-11' });
  plans.mockReturnValue([]);
  system.mockResolvedValue({ integrations: [] });
  latency.mockResolvedValue({ routes: [] });
});

async function get(url: string, token?: string) {
  const app = await buildApp();
  try {
    return await app.inject({
      method: 'GET',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  } finally {
    await app.close();
  }
}

const ADMIN_ROUTES = [
  '/admin/session',
  '/admin/overview',
  '/admin/stores',
  '/admin/ai',
  '/admin/plans',
  '/admin/system',
  '/admin/latency',
];

describe('painel da administradora', () => {
  it.each(ADMIN_ROUTES)('%s: 401 sem login', async (url) => {
    expect((await get(url)).statusCode).toBe(401);
  });

  it.each(ADMIN_ROUTES)(
    '%s: 403 para uma conta que não é admin (e nada é consultado)',
    async (url) => {
      const response = await get(url, USER_TOKEN);

      expect(response.statusCode).toBe(403);
      expect(overview).not.toHaveBeenCalled();
      expect(stores).not.toHaveBeenCalled();
      expect(ai).not.toHaveBeenCalled();
      expect(system).not.toHaveBeenCalled();
      expect(latency).not.toHaveBeenCalled();
    },
  );

  it.each(ADMIN_ROUTES)('%s: 200 para admin', async (url) => {
    expect((await get(url, ADMIN_TOKEN)).statusCode).toBe(200);
  });

  it('GET /admin/session confirma a administradora', async () => {
    const response = await get('/admin/session', ADMIN_TOKEN);
    expect(response.json()).toEqual({ admin: true });
  });

  it('GET /admin/stores repassa a busca, o plano e a ordenação ao serviço', async () => {
    await get('/admin/stores?search=ana&plan=pro&sort=gmv', ADMIN_TOKEN);
    // "pro" não é um plano válido (o id é "premium"): validado antes de chegar ao serviço.
    expect(stores).not.toHaveBeenCalled();

    await get('/admin/stores?search=ana&plan=premium&sort=gmv&page=2', ADMIN_TOKEN);
    expect(stores).toHaveBeenCalledWith({
      search: 'ana',
      plan: 'premium',
      sort: 'gmv',
      page: 2,
      pageSize: 25,
    });
  });

  it('GET /admin/ai valida o formato do período', async () => {
    expect((await get('/admin/ai?period=2026-13', ADMIN_TOKEN)).statusCode).toBe(400);
    expect((await get('/admin/ai?period=2026-10', ADMIN_TOKEN)).statusCode).toBe(200);
    expect(ai).toHaveBeenCalledWith({ period: '2026-10' });
  });
});
