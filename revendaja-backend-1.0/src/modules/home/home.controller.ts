import type { FastifyReply, FastifyRequest } from 'fastify';
import { homeService } from './home.service';
import type { HomeQuery } from './home.schema';

export async function getHome(
  request: FastifyRequest<{ Querystring: HomeQuery }>,
  reply: FastifyReply,
) {
  const home = await homeService.get(request.userId as string, request.query);
  return reply.send(home);
}
