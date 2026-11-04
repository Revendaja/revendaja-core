import type { FastifyInstance } from 'fastify';
import { getHealth, getReady } from './health.controller';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    { schema: { tags: ['health'], summary: 'O servidor está de pé (não consulta o banco).' } },
    getHealth,
  );
  app.get(
    '/health/ready',
    { schema: { tags: ['health'], summary: 'O servidor e o banco de dados estão respondendo.' } },
    getReady,
  );
}
