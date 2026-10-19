import IORedis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../logger';

// Conexão única, compartilhada pela Queue e pelo Worker (BullMQ recomenda uma conexão por
// instância, não uma por fila). `maxRetriesPerRequest: null` é exigido pelo BullMQ: sem isso o
// ioredis desiste de comandos em espera assim que a conexão cai, em vez de deixar o BullMQ
// controlar o retry.
//
// Se o Redis ficar indisponível, só logamos o erro — a API continua no ar servindo venda/estoque
// normalmente (que não dependem de Redis), e o ioredis reconecta sozinho quando o Redis voltar.
// É uma exceção deliberada ao padrão "fail-fast" do resto do projeto: notificação é secundária ao
// core de venda.
export const queueConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

queueConnection.on('error', (error) => {
  logger.error({ err: error }, 'Erro na conexão do Redis (fila de notificações)');
});
