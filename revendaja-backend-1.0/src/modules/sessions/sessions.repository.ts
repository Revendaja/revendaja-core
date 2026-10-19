import { prisma } from '../../database/prisma';
import type { Session } from './sessions.types';

// Como `users`, este módulo não expõe rotas: é dono da tabela `sessions`, que
// `auth` (login/logout), `passwordReset` e o middleware `authenticate` usam.
export const sessionsRepository = {
  findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({ where: { id } });
  },

  // Cria a sessão da usuária ou SUBSTITUI a que já existe. É aqui que "uma
  // sessão por conta" acontece: `userId` é @unique, então o upsert nunca gera
  // duas linhas, e o `id` novo invalida todos os tokens emitidos antes.
  replaceForUser(userId: string, sessionId: string, expiresAt: Date): Promise<Session> {
    return prisma.session.upsert({
      where: { userId },
      create: { id: sessionId, userId, expiresAt },
      update: { id: sessionId, expiresAt, createdAt: new Date() },
    });
  },

  async deleteById(id: string): Promise<void> {
    await prisma.session.deleteMany({ where: { id } });
  },

  async deleteByUserId(userId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { userId } });
  },
};

export type SessionsRepository = typeof sessionsRepository;
