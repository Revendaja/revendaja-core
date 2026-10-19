import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const notificationCreate = jest.fn();
const notificationFindMany = jest.fn();
const notificationCount = jest.fn();
const notificationFindFirst = jest.fn();
const notificationUpdate = jest.fn();
const notificationUpdateMany = jest.fn();
const notificationDeleteMany = jest.fn();
const pushTokenUpsert = jest.fn();
const pushTokenDeleteMany = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: {
      findUnique: (...args: unknown[]) => sessionFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    notification: {
      create: (...args: unknown[]) => notificationCreate(...args),
      findMany: (...args: unknown[]) => notificationFindMany(...args),
      count: (...args: unknown[]) => notificationCount(...args),
      findFirst: (...args: unknown[]) => notificationFindFirst(...args),
      update: (...args: unknown[]) => notificationUpdate(...args),
      updateMany: (...args: unknown[]) => notificationUpdateMany(...args),
      deleteMany: (...args: unknown[]) => notificationDeleteMany(...args),
    },
    pushToken: {
      upsert: (...args: unknown[]) => pushTokenUpsert(...args),
      deleteMany: (...args: unknown[]) => pushTokenDeleteMany(...args),
    },
  },
}));

import { buildApp } from '../../../app';
import { notificationsQueue } from '../../../shared/queue/queues';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ADMIN_ID = '6b3c9e2a-1f4d-4b3a-9c1e-8f2a7d6e5b4c';
const NOTIFICATION_ID = '5c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
const OTHER_USER_ID = 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7';
const USER_SESSION_ID = 'a3b1c9d8-2e4f-4a6b-8c1d-3e5f7a9b0c1d';
const ADMIN_SESSION_ID = 'b4c2d0e9-3f5a-4b7c-9d2e-4f6a8b0c1d2e';
const TOKEN = signTestAccessToken(USER_ID, USER_SESSION_ID);
const ADMIN_TOKEN = signTestAccessToken(ADMIN_ID, ADMIN_SESSION_ID);

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  };
}

function buildNotificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION_ID,
    userId: USER_ID,
    type: 'SYSTEM',
    title: 'Título',
    message: 'Mensagem',
    data: null,
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  sessionFindUnique.mockReset();
  userFindUnique.mockReset();
  notificationCreate.mockReset();
  notificationFindMany.mockReset();
  notificationCount.mockReset();
  notificationFindFirst.mockReset();
  notificationUpdate.mockReset();
  notificationUpdateMany.mockReset();
  notificationDeleteMany.mockReset();
  pushTokenUpsert.mockReset();
  pushTokenDeleteMany.mockReset();
  jest.mocked(notificationsQueue.add).mockClear();

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
    Promise.resolve(
      where.id === ADMIN_ID
        ? buildUser({ id: ADMIN_ID, role: 'admin' })
        : buildUser({ id: where.id }),
    ),
  );
});

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
  token = TOKEN,
) {
  const app = await buildApp();
  try {
    return await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  } finally {
    await app.close();
  }
}

describe('notification routes', () => {
  describe('rotas admin', () => {
    it('POST /notifications/admin/all: 403 para usuária sem role admin', async () => {
      const response = await call('POST', '/notifications/admin/all', {
        title: 'Nova versão',
        message: 'Confira!',
        type: 'SYSTEM',
      });

      expect(response.statusCode).toBe(403);
      expect(notificationsQueue.add).not.toHaveBeenCalled();
    });

    it('POST /notifications/admin/all: 202 e enfileira o fan-out para um admin', async () => {
      const response = await call(
        'POST',
        '/notifications/admin/all',
        { title: 'Nova versão', message: 'Confira!', type: 'SYSTEM' },
        ADMIN_TOKEN,
      );

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ queued: true });
      expect(notificationsQueue.add).toHaveBeenCalledWith('notification:fanout', {
        scope: 'all',
        type: 'SYSTEM',
        title: 'Nova versão',
        message: 'Confira!',
      });
    });

    it('POST /notifications/admin/plan: 202 e enfileira com o plano informado', async () => {
      const response = await call(
        'POST',
        '/notifications/admin/plan',
        { plan: 'premium', title: 'Novidade Pro', message: 'Confira!' },
        ADMIN_TOKEN,
      );

      expect(response.statusCode).toBe(202);
      expect(notificationsQueue.add).toHaveBeenCalledWith('notification:fanout', {
        scope: 'plan',
        plan: 'premium',
        type: 'SYSTEM',
        title: 'Novidade Pro',
        message: 'Confira!',
      });
    });

    it('POST /notifications/admin/user/:userId: 404 quando o usuário não existe', async () => {
      userFindUnique.mockResolvedValueOnce(buildUser({ id: ADMIN_ID, role: 'admin' }));
      userFindUnique.mockResolvedValueOnce(null);

      const response = await call(
        'POST',
        `/notifications/admin/user/${OTHER_USER_ID}`,
        { title: 'Aviso', message: 'Sua assinatura precisa de atenção.', type: 'SYSTEM' },
        ADMIN_TOKEN,
      );

      expect(response.statusCode).toBe(404);
    });

    it('POST /notifications/admin/user/:userId: 201 e enfileira o push só para esse usuário', async () => {
      notificationCreate.mockResolvedValue(buildNotificationRow({ userId: OTHER_USER_ID }));

      const response = await call(
        'POST',
        `/notifications/admin/user/${OTHER_USER_ID}`,
        { title: 'Aviso', message: 'Sua assinatura precisa de atenção.', type: 'SYSTEM' },
        ADMIN_TOKEN,
      );

      expect(response.statusCode).toBe(201);
      expect(notificationsQueue.add).toHaveBeenCalledWith('push:send', {
        userIds: [OTHER_USER_ID],
        title: 'Aviso',
        body: 'Sua assinatura precisa de atenção.',
        data: undefined,
      });
    });

    it('POST /notifications/admin/stock-check: 403 para usuária sem role admin', async () => {
      const response = await call('POST', '/notifications/admin/stock-check');

      expect(response.statusCode).toBe(403);
      expect(notificationsQueue.add).not.toHaveBeenCalled();
    });

    it('POST /notifications/admin/stock-check: 202 e enfileira o job pra um admin', async () => {
      const response = await call(
        'POST',
        '/notifications/admin/stock-check',
        undefined,
        ADMIN_TOKEN,
      );

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ queued: true });
      expect(notificationsQueue.add).toHaveBeenCalledWith('notification:stock-check', {});
    });
  });

  describe('rotas da usuária autenticada', () => {
    it('GET /notifications: lista só as notificações do próprio usuário', async () => {
      notificationFindMany.mockResolvedValue([buildNotificationRow()]);
      notificationCount.mockResolvedValue(1);

      const response = await call('GET', '/notifications');

      expect(response.statusCode).toBe(200);
      expect(notificationFindMany.mock.calls[0][0].where).toEqual({ userId: USER_ID });
      expect(response.json()).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    });

    it('GET /notifications/unread-count', async () => {
      notificationCount.mockResolvedValue(4);

      const response = await call('GET', '/notifications/unread-count');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ count: 4 });
      expect(notificationCount.mock.calls[0][0].where).toEqual({ userId: USER_ID, isRead: false });
    });

    it('PATCH /notifications/:id/read: 404 quando a notificação é de outro usuário', async () => {
      notificationFindFirst.mockResolvedValue(null);

      const response = await call('PATCH', `/notifications/${NOTIFICATION_ID}/read`);

      expect(response.statusCode).toBe(404);
      expect(notificationFindFirst.mock.calls[0][0].where).toEqual({
        id: NOTIFICATION_ID,
        userId: USER_ID,
      });
    });

    it('PATCH /notifications/:id/read: marca como lida', async () => {
      notificationFindFirst.mockResolvedValue(buildNotificationRow());
      notificationUpdate.mockResolvedValue(
        buildNotificationRow({ isRead: true, readAt: new Date() }),
      );

      const response = await call('PATCH', `/notifications/${NOTIFICATION_ID}/read`);

      expect(response.statusCode).toBe(200);
      expect(response.json().isRead).toBe(true);
    });

    it('PATCH /notifications/read-all', async () => {
      notificationUpdateMany.mockResolvedValue({ count: 3 });

      const response = await call('PATCH', '/notifications/read-all');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ updated: 3 });
    });

    it('DELETE /notifications/:id: 404 quando a notificação é de outro usuário', async () => {
      notificationDeleteMany.mockResolvedValue({ count: 0 });

      const response = await call('DELETE', `/notifications/${NOTIFICATION_ID}`);

      expect(response.statusCode).toBe(404);
      expect(notificationDeleteMany.mock.calls[0][0].where).toEqual({
        id: NOTIFICATION_ID,
        userId: USER_ID,
      });
    });

    it('DELETE /notifications/:id: 204 ao remover com sucesso', async () => {
      notificationDeleteMany.mockResolvedValue({ count: 1 });

      const response = await call('DELETE', `/notifications/${NOTIFICATION_ID}`);

      expect(response.statusCode).toBe(204);
    });
  });

  describe('tokens de dispositivo', () => {
    it('POST /notifications/device-tokens registra o token da usuária autenticada', async () => {
      pushTokenUpsert.mockResolvedValue({
        id: 'token-1',
        userId: USER_ID,
        token: 'ExponentPushToken[abc]',
        platform: 'android',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await call('POST', '/notifications/device-tokens', {
        token: 'ExponentPushToken[abc]',
        platform: 'android',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ registered: true });
      expect(pushTokenUpsert.mock.calls[0][0].where).toEqual({ token: 'ExponentPushToken[abc]' });
    });

    it('DELETE /notifications/device-tokens/:token: 404 quando o token não é do usuário', async () => {
      pushTokenDeleteMany.mockResolvedValue({ count: 0 });

      const response = await call(
        'DELETE',
        '/notifications/device-tokens/ExponentPushToken%5Babc%5D',
      );

      expect(response.statusCode).toBe(404);
    });

    it('DELETE /notifications/device-tokens/:token: 204 ao remover com sucesso', async () => {
      pushTokenDeleteMany.mockResolvedValue({ count: 1 });

      const response = await call(
        'DELETE',
        '/notifications/device-tokens/ExponentPushToken%5Babc%5D',
      );

      expect(response.statusCode).toBe(204);
      expect(pushTokenDeleteMany.mock.calls[0][0].where).toEqual({
        userId: USER_ID,
        token: 'ExponentPushToken[abc]',
      });
    });
  });
});
