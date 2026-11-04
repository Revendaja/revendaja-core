import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../database/prisma';

// "O servidor está de pé?" Não toca no banco: responde em ~1 ms e não depende de nada externo.
// É o que monitores e balanceadores devem chamar com frequência. Consultar o banco a cada checagem
// só gastaria tempo e, com o Neon, manteria o computador do banco sempre acordado (e cobrando).
export async function getHealth(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
}

// "O servidor E o banco estão funcionando?" Faz uma consulta de verdade. Use para diagnóstico e para
// conferir um deploy, não para checagens a cada poucos segundos.
export async function getReady(_request: FastifyRequest, reply: FastifyReply) {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return reply
      .status(503)
      .send({ status: 'unavailable', database: 'down', timestamp: new Date().toISOString() });
  }
  return reply.status(200).send({
    status: 'ok',
    database: 'ok',
    databaseLatencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  });
}
