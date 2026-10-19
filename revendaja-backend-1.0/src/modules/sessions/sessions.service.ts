import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { sessionsRepository, type SessionsRepository } from './sessions.repository';
import type { Session } from './sessions.types';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

interface TokenPayload {
  sub: string;
  sid?: string;
}

// Uma sessão só vale se existir, for da usuária do token e não tiver expirado.
// Compartilhado pelo middleware `authenticate` (access token) e pelo `refresh`.
export function isSessionActive(session: Session | null, userId: string): session is Session {
  return session !== null && session.userId === userId && session.expiresAt.getTime() > Date.now();
}

// Regra de "sessão única": iniciar uma sessão para a usuária derruba a anterior
// (se houver). Os dois tokens carregam o id da sessão (`sid`) e o middleware
// `authenticate` confere no banco que esse id ainda é a sessão vigente.
export class SessionService {
  constructor(private readonly repository: SessionsRepository = sessionsRepository) {}

  private signAccessToken(userId: string, sessionId: string): string {
    return jwt.sign({ sub: userId, sid: sessionId }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  async start(userId: string): Promise<SessionTokens> {
    const sessionId = crypto.randomUUID();

    const refreshToken = jwt.sign({ sub: userId, sid: sessionId }, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
    const accessToken = this.signAccessToken(userId, sessionId);

    // A sessão vive tanto quanto o refresh token: lemos o `exp` dele em vez de
    // reinterpretar a string de env ("30d", "12h"...).
    const { exp } = jwt.decode(refreshToken) as { exp: number };
    await this.repository.replaceForUser(userId, sessionId, new Date(exp * 1000));

    return { accessToken, refreshToken };
  }

  // Troca um refresh token válido por um novo access token, na MESMA sessão.
  // O refresh token não é rotacionado: ele segue valendo até o fim da sessão
  // (JWT_REFRESH_EXPIRES_IN depois do login), o que torna a chamada idempotente
  // — repetir por falha de rede não derruba ninguém. Se a sessão foi trocada
  // (login em outro aparelho), apagada (logout/redefinição de senha) ou expirou,
  // o refresh token deixa de servir e a usuária precisa fazer login de novo.
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: TokenPayload;
    try {
      // Assinado com outro segredo: um access token nunca passa aqui.
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as TokenPayload;
    } catch {
      throw new UnauthorizedError('Refresh token inválido ou expirado. Faça login novamente.');
    }

    const session = payload.sid ? await this.repository.findById(payload.sid) : null;
    if (!isSessionActive(session, payload.sub)) {
      throw new UnauthorizedError('Sessão encerrada. Faça login novamente.');
    }

    return { accessToken: this.signAccessToken(session.userId, session.id) };
  }

  end(sessionId: string): Promise<void> {
    return this.repository.deleteById(sessionId);
  }

  // Usado ao redefinir a senha: quem tinha a senha antiga não pode continuar logado.
  endAllForUser(userId: string): Promise<void> {
    return this.repository.deleteByUserId(userId);
  }
}

export const sessionService = new SessionService();
