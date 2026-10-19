import { Prisma } from '@prisma/client';
import { isUniqueViolation } from '../../database/errors';
import { prisma } from '../../database/prisma';
import type { StorePlan } from '../store/store.types';
import type {
  CreateNotificationInput,
  CreateNotificationsForUsersInput,
  Notification,
} from './notifications.types';

const BATCH_SIZE = 500;

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Prisma.JsonValue;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type as Notification['type'],
    title: row.title,
    message: row.message,
    data: (row.data as Record<string, unknown> | null) ?? null,
    isRead: row.isRead,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

interface IdBatch {
  ids: string[];
  nextCursor: string | null;
}

export const notificationsRepository = {
  async create(input: CreateNotificationInput): Promise<Notification> {
    const row = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        // `undefined` omite o campo (fica null, o default da coluna); `null` explícito precisa do
        // sentinel do Prisma pra Json — sem isso ele tentaria gravar um JSON `null` inválido.
        data:
          input.data === undefined
            ? undefined
            : input.data === null
              ? Prisma.JsonNull
              : (input.data as Prisma.InputJsonValue),
      },
    });
    return mapNotification(row);
  },

  // Mesma notificação (mesmo título/mensagem/tipo) pra vários usuários de uma vez — usado pelo
  // worker do job `notification:fanout` (broadcast ALL/PLAN). `createMany` não devolve as linhas
  // criadas; não precisamos: quem enfileira o push já tem os `userIds` em mãos.
  async createManyForUsers(input: CreateNotificationsForUsersInput): Promise<void> {
    if (input.userIds.length === 0) return;
    await prisma.notification.createMany({
      data: input.userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
      })),
    });
  },

  async listForUser(
    userId: string,
    { page, pageSize }: { page: number; pageSize: number },
  ): Promise<{ items: Notification[]; total: number }> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
    return { items: rows.map(mapNotification), total };
  },

  countUnread(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  },

  // Escopado por userId: devolve null se a notificação não existe OU é de outra usuária (o
  // service trata os dois casos como "não encontrada", sem revelar qual dos dois é).
  async markRead(userId: string, id: string): Promise<Notification | null> {
    const existing = await prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) return null;
    if (existing.isRead) return mapNotification(existing);

    const row = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return mapNotification(row);
  },

  async markAllRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  },

  // Escopado por userId: devolve false se a notificação não existe OU é de outra usuária (o
  // service trata os dois casos como "não encontrada", sem revelar qual dos dois é).
  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const result = await prisma.notification.deleteMany({ where: { id, userId } });
    return result.count === 1;
  },

  // Todos os ids de usuário, em lotes de `BATCH_SIZE` — usado pelo fan-out do broadcast ALL. O
  // worker chama de novo com `nextCursor` até ele voltar null.
  async findUserIdsBatch(cursor: string | null, take = BATCH_SIZE): Promise<IdBatch> {
    const rows = await prisma.user.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const ids = rows.map((row) => row.id);
    return { ids, nextCursor: ids.length === take ? ids[ids.length - 1] : null };
  },

  // Ids de usuário das lojas de um plano, em lotes — mesma lógica de paginação do fan-out ALL,
  // usada pelo broadcast PLAN.
  async findUserIdsByPlanBatch(
    plan: StorePlan,
    cursor: string | null,
    take = BATCH_SIZE,
  ): Promise<IdBatch> {
    const rows = await prisma.store.findMany({
      where: { plan },
      select: { id: true, userId: true },
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const ids = rows.map((row) => row.userId);
    return { ids, nextCursor: rows.length === take ? rows[rows.length - 1].id : null };
  },

  // Tenta reservar a notificação de progresso de meta pro mês/gatilho: o índice único
  // (storeId, monthKey, threshold) garante atomicidade (tenta inserir e trata violação, sem
  // SELECT antes) — devolve false se esse mês/gatilho já foi notificado.
  async tryClaimGoalNotification(
    storeId: string,
    monthKey: string,
    threshold: number,
  ): Promise<boolean> {
    try {
      await prisma.storeGoalNotification.create({ data: { storeId, monthKey, threshold } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  },

  // Desfaz o claim acima: usado quando `tryClaimGoalNotification` teve sucesso mas notificar falhou
  // depois (ver runGoalCheck) — sem isso a loja ficaria marcada como notificada pra sempre pro
  // mesmo mês/gatilho, sem ninguém ter recebido nada.
  async deleteGoalNotificationClaim(
    storeId: string,
    monthKey: string,
    threshold: number,
  ): Promise<void> {
    await prisma.storeGoalNotification.deleteMany({ where: { storeId, monthKey, threshold } });
  },
};

export type NotificationsRepository = typeof notificationsRepository;
