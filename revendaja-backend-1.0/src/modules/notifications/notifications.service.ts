import { NotFoundError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import type { PushPlatform, PushTokenRepository } from '../../shared/push/pushToken.repository';
import { pushTokenRepository } from '../../shared/push/pushToken.repository';
import {
  JOB_NOTIFICATION_FANOUT,
  JOB_PUSH_SEND,
  notificationsQueue,
} from '../../shared/queue/queues';
import type { Paginated } from '../catalog/catalog.types';
import type { StorePlan } from '../store/store.types';
import { usersRepository, type UsersRepository } from '../users/users.repository';
import { notificationsRepository, type NotificationsRepository } from './notifications.repository';
import type { Notification, NotificationType } from './notifications.types';

type NotificationsQueueLike = Pick<typeof notificationsQueue, 'add'>;

interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
}

export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository = notificationsRepository,
    private readonly pushTokens: PushTokenRepository = pushTokenRepository,
    private readonly users: UsersRepository = usersRepository,
    private readonly queue: NotificationsQueueLike = notificationsQueue,
  ) {}

  // Notifica 1 usuária específica: grava direto (1 linha) e enfileira o push, sem passar pelo
  // fan-out assíncrono. Usado por POST /admin/user/:id e pelos 3 jobs automáticos (estoque, meta,
  // promoção) — todos já sabem qual usuária notificar, um por vez.
  async notifyUser(userId: string, input: NotifyInput): Promise<Notification> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado.');
    }

    const notification = await this.repository.create({ userId, ...input });

    // O push é uma entrega best-effort SOBRE uma notificação que já existe (a usuária já vê ela no
    // app de qualquer forma). Se o enfileiramento falhar (blip do Redis, etc.), só loga — não
    // derruba a criação, que já teve sucesso. Deixar isso subir faria quem chama (ex.: os jobs
    // periódicos de estoque/meta/promoção) achar que a notificação inteira falhou e desfazer o
    // claim/marca de "já notificado", gerando uma SEGUNDA notificação duplicada na próxima varredura
    // para o mesmo evento.
    try {
      await this.queue.add(JOB_PUSH_SEND, {
        userIds: [userId],
        title: input.title,
        body: input.message,
        data: input.data ?? undefined,
      });
    } catch (error) {
      logger.error(
        { err: error, userId, notificationId: notification.id },
        'Falha ao enfileirar o push da notificação (a notificação em si já foi criada)',
      );
    }

    return notification;
  }

  // Não grava nada nesta chamada: só enfileira o fan-out, que resolve os destinatários e grava
  // fora da request HTTP (ver notifications.worker.ts). É assim que o broadcast não trava a
  // resposta do admin nem sobrecarrega o banco numa request só.
  async notifyAll(input: {
    type: NotificationType;
    title: string;
    message: string;
  }): Promise<void> {
    await this.queue.add(JOB_NOTIFICATION_FANOUT, { scope: 'all', ...input });
  }

  async notifyByPlan(
    plan: StorePlan,
    input: { title: string; message: string; type?: NotificationType },
  ): Promise<void> {
    await this.queue.add(JOB_NOTIFICATION_FANOUT, {
      scope: 'plan',
      plan,
      type: input.type ?? 'SYSTEM',
      title: input.title,
      message: input.message,
    });
  }

  async list(
    userId: string,
    query: { page: number; pageSize: number },
  ): Promise<Paginated<Notification>> {
    const { items, total } = await this.repository.listForUser(userId, query);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  unreadCount(userId: string): Promise<number> {
    return this.repository.countUnread(userId);
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.repository.markRead(userId, id);
    if (!notification) {
      throw new NotFoundError('Notificação não encontrada.');
    }
    return notification;
  }

  markAllRead(userId: string): Promise<number> {
    return this.repository.markAllRead(userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.repository.deleteForUser(userId, id);
    if (!removed) {
      throw new NotFoundError('Notificação não encontrada.');
    }
  }

  async registerDeviceToken(userId: string, token: string, platform?: PushPlatform): Promise<void> {
    await this.pushTokens.upsert(userId, token, platform ?? null);
  }

  async unregisterDeviceToken(userId: string, token: string): Promise<void> {
    const removed = await this.pushTokens.deleteByUserAndToken(userId, token);
    if (!removed) {
      throw new NotFoundError('Token de dispositivo não encontrado.');
    }
  }
}

export const notificationsService = new NotificationsService();
