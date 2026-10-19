import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../database/prisma';

export async function getHealth(_request: FastifyRequest, reply: FastifyReply) {
  await prisma.$queryRaw`SELECT 1`;
  return reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
}
