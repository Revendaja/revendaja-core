import type { FastifyReply, FastifyRequest } from 'fastify';
import { NotFoundError } from '../../shared/errors/AppError';
import { usersRepository } from '../users/users.repository';
import { otpService } from './otp.service';
import type { VerifyOtpInput } from './otp.schema';

export async function verifyOtp(
  request: FastifyRequest<{ Body: VerifyOtpInput }>,
  reply: FastifyReply,
) {
  await otpService.verify(request.userId as string, request.body.code);
  return reply.status(200).send({ isVerified: true });
}

export async function resendOtp(request: FastifyRequest, reply: FastifyReply) {
  const user = await usersRepository.findById(request.userId as string);
  if (!user) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  await otpService.resend(user);
  return reply.status(200).send({ sent: true });
}
