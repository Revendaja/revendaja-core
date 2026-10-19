import type { FastifyReply, FastifyRequest } from 'fastify';
import { passwordResetService } from './passwordReset.service';
import type { ForgotPasswordInput, ResetPasswordInput } from './passwordReset.schema';

export async function forgotPassword(
  request: FastifyRequest<{ Body: ForgotPasswordInput }>,
  reply: FastifyReply,
) {
  await passwordResetService.requestReset(request.body.email);
  return reply.status(200).send({ sent: true });
}

export async function resetPassword(
  request: FastifyRequest<{ Body: ResetPasswordInput }>,
  reply: FastifyReply,
) {
  await passwordResetService.resetPassword(request.body);
  return reply.status(200).send({ reset: true });
}
