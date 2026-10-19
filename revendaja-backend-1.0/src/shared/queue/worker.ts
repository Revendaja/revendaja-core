import { Worker, type Processor } from 'bullmq';
import { logger } from '../logger';
import { NOTIFICATIONS_QUEUE, type NotificationJobData } from './queues';
import { queueConnection } from './redis';

// Um único Worker para a fila `notifications`: quem decide o que fazer com cada job é o
// `processor` recebido (ver notifications.worker.ts), despachando por `job.name`. Uma falha aqui
// só é logada — nunca derruba o processo, mesmo espírito de `startPeriodicJob` (src/shared/jobs.ts).
export function startNotificationsWorker(
  processor: Processor<NotificationJobData>,
): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(NOTIFICATIONS_QUEUE, processor, {
    connection: queueConnection,
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, jobName: job?.name },
      'Falha ao processar job da fila de notificações',
    );
  });

  return worker;
}
