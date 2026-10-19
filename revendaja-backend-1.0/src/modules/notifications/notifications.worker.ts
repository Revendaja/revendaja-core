import type { Job } from 'bullmq';
import { pushNotificationService } from '../../shared/push/pushNotificationService';
import { pushTokenRepository } from '../../shared/push/pushToken.repository';
import {
  JOB_GOAL_CHECK,
  JOB_NOTIFICATION_FANOUT,
  JOB_PROMOTION,
  JOB_PUSH_SEND,
  JOB_STOCK_CHECK,
  notificationsQueue,
  type NotificationFanoutJobData,
  type NotificationJobData,
  type PushSendJobData,
} from '../../shared/queue/queues';
import { notificationsRepository } from './notifications.repository';
import { runGoalCheck } from './notifications.goalCheck';
import { runPromotionCheck } from './notifications.promotion';
import { runStockCheck } from './notifications.stockCheck';

async function processPushSend(data: PushSendJobData): Promise<void> {
  const tokens = await pushTokenRepository.findTokensByUserIds(data.userIds);
  await pushNotificationService.send(tokens, {
    title: data.title,
    body: data.body,
    data: data.data,
  });
}

// Resolve os destinatários do broadcast em lotes (evita carregar a base inteira em memória e uma
// transação gigante), grava as notificações do lote e enfileira UM job de push por lote (não um
// por usuário — evita explosão de jobs numa base grande).
async function processFanout(data: NotificationFanoutJobData): Promise<void> {
  let cursor: string | null = null;

  do {
    const batch: { ids: string[]; nextCursor: string | null } =
      data.scope === 'all'
        ? await notificationsRepository.findUserIdsBatch(cursor)
        : await notificationsRepository.findUserIdsByPlanBatch(data.plan, cursor);

    if (batch.ids.length > 0) {
      await notificationsRepository.createManyForUsers({
        userIds: batch.ids,
        type: data.type,
        title: data.title,
        message: data.message,
      });
      await notificationsQueue.add(JOB_PUSH_SEND, {
        userIds: batch.ids,
        title: data.title,
        body: data.message,
      });
    }

    cursor = batch.nextCursor;
  } while (cursor !== null);
}

// Único processor da fila `notifications`: despacha por `job.name` (ver src/shared/queue/worker.ts,
// que só sabe iniciar um Worker genérico — a lógica de negócio de cada job mora aqui).
export async function notificationsProcessor(job: Job<NotificationJobData>): Promise<void> {
  switch (job.name) {
    case JOB_PUSH_SEND:
      return processPushSend(job.data as PushSendJobData);
    case JOB_NOTIFICATION_FANOUT:
      return processFanout(job.data as NotificationFanoutJobData);
    case JOB_STOCK_CHECK:
      return runStockCheck();
    case JOB_GOAL_CHECK:
      return runGoalCheck();
    case JOB_PROMOTION:
      return runPromotionCheck();
    default:
      throw new Error(`Job desconhecido na fila de notificações: "${job.name}"`);
  }
}
