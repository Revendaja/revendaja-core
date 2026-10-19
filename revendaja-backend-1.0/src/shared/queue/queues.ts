import { Queue } from 'bullmq';
import type { NotificationType } from '../../modules/notifications/notifications.types';
import type { StorePlan } from '../../modules/store/store.types';
import { queueConnection } from './redis';

export const NOTIFICATIONS_QUEUE = 'notifications';

// Nomes dos jobs desta fila (todos processados pelo mesmo Worker, despachados por `job.name` —
// ver notifications.worker.ts). Os 3 últimos são repetíveis, registrados no boot (ver scheduler.ts).
export const JOB_PUSH_SEND = 'push:send';
export const JOB_NOTIFICATION_FANOUT = 'notification:fanout';
export const JOB_STOCK_CHECK = 'notification:stock-check';
export const JOB_GOAL_CHECK = 'notification:goal-check';
export const JOB_PROMOTION = 'notification:promotion';

export interface PushSendJobData {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type NotificationFanoutJobData = {
  type: NotificationType;
  title: string;
  message: string;
} & ({ scope: 'all' } | { scope: 'plan'; plan: StorePlan });

// Os 3 jobs recorrentes não recebem payload: cada execução varre o banco inteiro por conta própria.
export type NotificationJobData =
  PushSendJobData | NotificationFanoutJobData | Record<string, never>;

export const notificationsQueue = new Queue<NotificationJobData>(NOTIFICATIONS_QUEUE, {
  connection: queueConnection,
});
