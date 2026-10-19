import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { sessionsRepository } from '../../modules/sessions/sessions.repository';
import { isSessionActive } from '../../modules/sessions/sessions.service';
import { UnauthorizedError } from '../errors/AppError';

interface JwtPayload {
  sub: string;
  sid?: string;
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token de autenticação não informado.');
  }

  const token = authHeader.slice('Bearer '.length);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Token de autenticação inválido ou expirado.');
  }

  // Só assinatura válida não basta: a sessão precisa ser a vigente da usuária.
  // Um novo login (em outro aparelho), o logout ou a redefinição de senha
  // apagam/trocam a sessão, e os tokens antigos passam a ser recusados aqui.
  // Tokens emitidos antes de existir sessão (sem `sid`) também caem aqui.
  const session = payload.sid ? await sessionsRepository.findById(payload.sid) : null;
  if (!isSessionActive(session, payload.sub)) {
    throw new UnauthorizedError('Sessão encerrada. Faça login novamente.');
  }

  request.userId = payload.sub;
  request.sessionId = session.id;
}
