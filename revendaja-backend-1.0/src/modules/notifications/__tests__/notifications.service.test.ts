import { NotificationsService } from '../notifications.service';
import { NotFoundError } from '../../../shared/errors/AppError';
import type { NotificationsRepository } from '../notifications.repository';
import type { PushTokenRepository } from '../../../shared/push/pushToken.repository';
import type { UsersRepository } from '../../users/users.repository';
import type { User } from '../../users/users.types';
import type { Notification } from '../notifications.types';
import { JOB_NOTIFICATION_FANOUT, JOB_PUSH_SEND } from '../../../shared/queue/queues';

function createRepositoryMock(): jest.Mocked<NotificationsRepository> {
  return {
    create: jest.fn(),
    createManyForUsers: jest.fn(),
    listForUser: jest.fn(),
    countUnread: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    deleteForUser: jest.fn(),
    findUserIdsBatch: jest.fn(),
    findUserIdsByPlanBatch: jest.fn(),
    tryClaimGoalNotification: jest.fn(),
    deleteGoalNotificationClaim: jest.fn(),
  };
}

function createPushTokensMock(): jest.Mocked<PushTokenRepository> {
  return {
    upsert: jest.fn(),
    deleteByUserAndToken: jest.fn(),
    findTokensByUserIds: jest.fn(),
    deleteByToken: jest.fn(),
  };
}

function createUsersMock(): jest.Mocked<UsersRepository> {
  return {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByWhatsapp: jest.fn(),
    findByGoogleId: jest.fn(),
    create: jest.fn(),
    createFromGoogle: jest.fn(),
    linkGoogleId: jest.fn(),
    markPhoneVerified: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
  };
}

function createQueueMock() {
  return { add: jest.fn().mockResolvedValue(undefined) };
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Ana Souza',
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

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
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

describe('NotificationsService', () => {
  describe('notifyUser', () => {
    it('lança NotFoundError quando o usuário não existe', async () => {
      const repository = createRepositoryMock();
      const users = createUsersMock();
      users.findById.mockResolvedValue(null);
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        users,
        createQueueMock(),
      );

      await expect(
        service.notifyUser('user-1', { type: 'SYSTEM', title: 'Oi', message: 'Msg' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('grava a notificação e enfileira o push só para esse usuário', async () => {
      const repository = createRepositoryMock();
      const users = createUsersMock();
      const queue = createQueueMock();
      users.findById.mockResolvedValue(buildUser());
      const expectedNotification = buildNotification();
      repository.create.mockResolvedValue(expectedNotification);
      const service = new NotificationsService(repository, createPushTokensMock(), users, queue);

      const result = await service.notifyUser('user-1', {
        type: 'STOCK_LOW',
        title: 'Estoque baixo',
        message: 'Restam 2 unidades.',
        data: { action: 'OPEN_STOCK', productId: 'sp-1' },
      });

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'STOCK_LOW',
        title: 'Estoque baixo',
        message: 'Restam 2 unidades.',
        data: { action: 'OPEN_STOCK', productId: 'sp-1' },
      });
      expect(queue.add).toHaveBeenCalledWith(JOB_PUSH_SEND, {
        userIds: ['user-1'],
        title: 'Estoque baixo',
        body: 'Restam 2 unidades.',
        data: { action: 'OPEN_STOCK', productId: 'sp-1' },
      });
      expect(result).toEqual(expectedNotification);
    });

    it('a notificação já criada não é desfeita se o enfileiramento do push falhar', async () => {
      const repository = createRepositoryMock();
      const users = createUsersMock();
      const queue = createQueueMock();
      users.findById.mockResolvedValue(buildUser());
      const expectedNotification = buildNotification();
      repository.create.mockResolvedValue(expectedNotification);
      queue.add.mockRejectedValue(new Error('Redis fora do ar'));
      const service = new NotificationsService(repository, createPushTokensMock(), users, queue);

      // Não relança: quem chama (ex.: os jobs de estoque/meta/promoção) não pode achar que a
      // notificação inteira falhou e desfazer o claim, gerando uma duplicata na próxima varredura.
      const result = await service.notifyUser('user-1', {
        type: 'STOCK_LOW',
        title: 'Estoque baixo',
        message: 'Restam 2 unidades.',
      });

      expect(result).toEqual(expectedNotification);
      expect(repository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyAll / notifyByPlan', () => {
    it('notifyAll só enfileira o fan-out, sem gravar nada', async () => {
      const repository = createRepositoryMock();
      const queue = createQueueMock();
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        queue,
      );

      await service.notifyAll({ type: 'SYSTEM', title: 'Nova versão', message: 'Confira!' });

      expect(queue.add).toHaveBeenCalledWith(JOB_NOTIFICATION_FANOUT, {
        scope: 'all',
        type: 'SYSTEM',
        title: 'Nova versão',
        message: 'Confira!',
      });
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.createManyForUsers).not.toHaveBeenCalled();
    });

    it('notifyByPlan enfileira o fan-out com o plano e usa SYSTEM como tipo padrão', async () => {
      const repository = createRepositoryMock();
      const queue = createQueueMock();
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        queue,
      );

      await service.notifyByPlan('premium', { title: 'Novidade Pro', message: 'Confira!' });

      expect(queue.add).toHaveBeenCalledWith(JOB_NOTIFICATION_FANOUT, {
        scope: 'plan',
        plan: 'premium',
        type: 'SYSTEM',
        title: 'Novidade Pro',
        message: 'Confira!',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('list / unreadCount', () => {
    it('devolve a paginação com page/pageSize da query', async () => {
      const repository = createRepositoryMock();
      const notification = buildNotification();
      repository.listForUser.mockResolvedValue({ items: [notification], total: 1 });
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        createQueueMock(),
      );

      const result = await service.list('user-1', { page: 2, pageSize: 10 });

      expect(repository.listForUser).toHaveBeenCalledWith('user-1', { page: 2, pageSize: 10 });
      expect(result).toEqual({ items: [notification], page: 2, pageSize: 10, total: 1 });
    });

    it('unreadCount delega no repositório', async () => {
      const repository = createRepositoryMock();
      repository.countUnread.mockResolvedValue(3);
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        createQueueMock(),
      );

      await expect(service.unreadCount('user-1')).resolves.toBe(3);
    });
  });

  describe('markRead', () => {
    it('lança NotFoundError quando a notificação não existe ou é de outro usuário', async () => {
      const repository = createRepositoryMock();
      repository.markRead.mockResolvedValue(null);
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        createQueueMock(),
      );

      await expect(service.markRead('user-1', 'notif-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('é idempotente: marcar de novo uma já lida não estoura', async () => {
      const repository = createRepositoryMock();
      const alreadyRead = buildNotification({ isRead: true, readAt: new Date() });
      repository.markRead.mockResolvedValue(alreadyRead);
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        createQueueMock(),
      );

      await expect(service.markRead('user-1', 'notif-1')).resolves.toEqual(alreadyRead);
    });
  });

  describe('markAllRead', () => {
    it('devolve quantas notificações foram atualizadas', async () => {
      const repository = createRepositoryMock();
      repository.markAllRead.mockResolvedValue(5);
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        createQueueMock(),
      );

      await expect(service.markAllRead('user-1')).resolves.toBe(5);
    });
  });

  describe('remove', () => {
    it('lança NotFoundError quando a notificação não existe ou é de outro usuário', async () => {
      const repository = createRepositoryMock();
      repository.deleteForUser.mockResolvedValue(false);
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        createQueueMock(),
      );

      await expect(service.remove('user-1', 'notif-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('remove a notificação do próprio usuário', async () => {
      const repository = createRepositoryMock();
      repository.deleteForUser.mockResolvedValue(true);
      const service = new NotificationsService(
        repository,
        createPushTokensMock(),
        createUsersMock(),
        createQueueMock(),
      );

      await expect(service.remove('user-1', 'notif-1')).resolves.toBeUndefined();
      expect(repository.deleteForUser).toHaveBeenCalledWith('user-1', 'notif-1');
    });
  });

  describe('device tokens', () => {
    it('registerDeviceToken chama upsert com a plataforma informada', async () => {
      const pushTokens = createPushTokensMock();
      const service = new NotificationsService(
        createRepositoryMock(),
        pushTokens,
        createUsersMock(),
        createQueueMock(),
      );

      await service.registerDeviceToken('user-1', 'ExponentPushToken[abc]', 'android');

      expect(pushTokens.upsert).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc]', 'android');
    });

    it('unregisterDeviceToken lança NotFoundError quando o token não é do usuário', async () => {
      const pushTokens = createPushTokensMock();
      pushTokens.deleteByUserAndToken.mockResolvedValue(false);
      const service = new NotificationsService(
        createRepositoryMock(),
        pushTokens,
        createUsersMock(),
        createQueueMock(),
      );

      await expect(
        service.unregisterDeviceToken('user-1', 'ExponentPushToken[abc]'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('unregisterDeviceToken resolve normalmente quando remove com sucesso', async () => {
      const pushTokens = createPushTokensMock();
      pushTokens.deleteByUserAndToken.mockResolvedValue(true);
      const service = new NotificationsService(
        createRepositoryMock(),
        pushTokens,
        createUsersMock(),
        createQueueMock(),
      );

      await expect(
        service.unregisterDeviceToken('user-1', 'ExponentPushToken[abc]'),
      ).resolves.toBeUndefined();
    });
  });
});
