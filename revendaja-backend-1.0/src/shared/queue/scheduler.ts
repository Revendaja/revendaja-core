import { env } from '../../config/env';
import { JOB_GOAL_CHECK, JOB_PROMOTION, JOB_STOCK_CHECK, notificationsQueue } from './queues';

// Registra os 3 jobs recorrentes de forma idempotente: chamar de novo (ex.: a cada restart do
// servidor) ATUALIZA o agendamento em vez de duplicar (`upsertJobScheduler`, BullMQ >=5.7) — sem
// isso, cada boot criaria mais um agendamento repetível junto dos anteriores.
export async function registerRepeatableJobs(): Promise<void> {
  await notificationsQueue.upsertJobScheduler(
    `${JOB_STOCK_CHECK}:scheduler`,
    { every: env.NOTIFICATION_STOCK_CHECK_INTERVAL_MINUTES * 60_000 },
    { name: JOB_STOCK_CHECK, data: {} },
  );

  await notificationsQueue.upsertJobScheduler(
    `${JOB_GOAL_CHECK}:scheduler`,
    { every: env.NOTIFICATION_GOAL_CHECK_INTERVAL_MINUTES * 60_000 },
    { name: JOB_GOAL_CHECK, data: {} },
  );

  await notificationsQueue.upsertJobScheduler(
    `${JOB_PROMOTION}:scheduler`,
    { every: env.NOTIFICATION_PROMOTION_SCAN_INTERVAL_MINUTES * 60_000 },
    { name: JOB_PROMOTION, data: {} },
  );
}
