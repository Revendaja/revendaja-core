import type { FastifyReply, FastifyRequest } from 'fastify';
import { usersRepository } from '../../modules/users/users.repository';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

// Precisa rodar depois de `authenticate` (usa `request.userId`). Não existe rota para
// promover alguém a admin: é uma operação manual no banco. Consulta o banco a cada
// chamada em vez de confiar numa claim do JWT, pelo mesmo motivo de `requireVerified` —
// o token não é reemitido quando o papel do usuário muda.
export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.userId) {
    throw new UnauthorizedError();
  }

  const user = await usersRepository.findById(request.userId);
  if (!user || user.role !== 'admin') {
    throw new ForbiddenError('Acesso restrito a administradores.');
  }
}
