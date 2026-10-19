import { buildApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './database/prisma';
import { notificationsProcessor } from './modules/notifications/notifications.worker';
import { startOnlineOrderExpiration } from './modules/sales/sales.expiration';
import { startVisitsCleanup } from './modules/storefront/storefront.cleanup';
import { logger } from './shared/logger';
import { notificationsQueue } from './shared/queue/queues';
import { queueConnection } from './shared/queue/redis';
import { registerRepeatableJobs } from './shared/queue/scheduler';
import { startNotificationsWorker } from './shared/queue/worker';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await connectDatabase();
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`Servidor rodando em http://${env.HOST}:${env.PORT} (docs em /docs)`);
  } catch (error) {
    logger.error(error, 'Falha ao iniciar o servidor');
    process.exit(1);
  }

  const visitsCleanup = startVisitsCleanup({ retentionDays: env.STORE_VISITS_RETENTION_DAYS });
  const orderExpiration = startOnlineOrderExpiration({
    expirationHours: env.ONLINE_ORDER_EXPIRATION_HOURS,
  });

  // Notificações nunca bloqueiam o boot do servidor: se o Redis estiver fora, só loga — venda e
  // estoque continuam funcionando normalmente, e a fila retoma sozinha quando o Redis voltar.
  const notificationsWorker = startNotificationsWorker(notificationsProcessor);
  registerRepeatableJobs().catch((error: unknown) => {
    logger.error({ err: error }, 'Falha ao registrar os jobs recorrentes de notificação');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Recebido sinal ${signal}, encerrando o servidor...`);
    visitsCleanup.stop();
    orderExpiration.stop();
    await notificationsWorker.close();
    await notificationsQueue.close();
    await queueConnection.quit();
    await app.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void start();
