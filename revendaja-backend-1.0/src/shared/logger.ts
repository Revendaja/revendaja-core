import pino from 'pino';
import { env } from '../config/env';

// Opções compartilhadas entre o logger "standalone" abaixo (usado fora do
// ciclo de vida de uma request, ex.: bootstrap em server.ts) e o logger que
// o Fastify cria internamente a partir da mesma configuração (ver app.ts).
// Passamos as opções, não uma instância pronta, para o Fastify — assim o
// tipo do logger da instância do Fastify continua sendo o `FastifyBaseLogger`
// padrão, compatível com o resto do ecossistema de tipos do Fastify.
export const pinoOptions = {
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
};

export const logger = pino(pinoOptions);
