import type { FastifyReply, FastifyRequest } from 'fastify';
import { usersRepository } from '../../modules/users/users.repository';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

// Precisa rodar depois de `authenticate` (usa `request.userId`). Consulta o
// banco a cada chamada em vez de confiar em uma claim do JWT porque o token
// de acesso é emitido no cadastro — antes de a usuária verificar o e-mail
// — e nunca é reemitido depois da verificação.
export function requireVerified(message = 'Confirme seu e-mail antes de continuar.') {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.userId) {
      throw new UnauthorizedError();
    }

    const user = await usersRepository.findById(request.userId);
    if (!user || !user.phoneVerifiedAt) {
      throw new ForbiddenError(message);
    }
  };
}
