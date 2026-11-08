import type { FastifyReply, FastifyRequest } from 'fastify';
import { accountService } from './account.service';
import type { DeleteAccountInput } from './account.schema';

export async function deleteAccount(
  request: FastifyRequest<{ Body: DeleteAccountInput }>,
  reply: FastifyReply,
) {
  await accountService.deleteAccount(request.userId as string, request.body);
  return reply.status(200).send({ deleted: true });
}
