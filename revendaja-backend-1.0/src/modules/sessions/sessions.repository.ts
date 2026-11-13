import { env } from '../../config/env';
import { prisma } from '../../database/prisma';
import type { User } from '../users/users.types';
import type { Session, SessionClient } from './sessions.types';

interface SessionWithUserRow {
  id: string;
  user_id: string;
  client: SessionClient;
  expires_at: Date;
  created_at: Date;
  name: string;
  email: string;
  whatsapp: string | null;
  password_hash: string | null;
  google_id: string | null;
  phone_verified_at: Date | null;
  role: string;
  user_created_at: Date;
}

// Como `users`, este módulo não expõe rotas: é dono da tabela `sessions`, que
// `auth` (login/logout), `passwordReset` e o middleware `authenticate` usam.
export const sessionsRepository = {
  findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({ where: { id } });
  },

  // A sessão e a usuária dona dela numa consulta só. O middleware `authenticate` precisa dos dois em
  // TODO pedido autenticado: buscar separado custava uma ida ao banco a mais (uns 60 ms daqui até
  // São Paulo) em cada pedido. As regras de validade não mudam: ver `isSessionActive`.
  //
  // SQL direto de propósito: o `include` do Prisma faz duas consultas (e o `JOIN` dele é um recurso
  // em "preview" que mudaria o jeito de todas as consultas do app).
  async findByIdWithUser(id: string): Promise<(Session & { user: User }) | null> {
    const rows = await prisma.$queryRaw<SessionWithUserRow[]>`
      SELECT
        s.id, s.user_id, s.client::text AS client, s.expires_at, s.created_at,
        u.name, u.email, u.whatsapp, u.password_hash, u.google_id, u.phone_verified_at,
        u.role::text AS role, u.created_at AS user_created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ${id}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      client: row.client,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        name: row.name,
        email: row.email,
        whatsapp: row.whatsapp,
        passwordHash: row.password_hash,
        googleId: row.google_id,
        phoneVerifiedAt: row.phone_verified_at,
        role: row.role as User['role'],
        createdAt: row.user_created_at,
      },
    };
  },

  // Cria a sessão. Web: no máximo uma (a anterior cai). Mobile: até `MAX_MOBILE_SESSIONS` aparelhos
  // ao mesmo tempo; passando disso, as mais antigas caem. O `id` novo é o `sid` dos tokens emitidos.
  replaceForUser(
    userId: string,
    sessionId: string,
    expiresAt: Date,
    client: SessionClient = 'mobile',
  ): Promise<Session> {
    return prisma.$transaction(async (tx) => {
      if (client === 'web') {
        await tx.session.deleteMany({ where: { userId, client: 'web' } });
      }
      const created = await tx.session.create({
        data: { id: sessionId, userId, client, expiresAt },
      });
      if (client === 'mobile') {
        const keep = await tx.session.findMany({
          where: { userId, client: 'mobile' },
          orderBy: { createdAt: 'desc' },
          take: env.MAX_MOBILE_SESSIONS,
          select: { id: true },
        });
        await tx.session.deleteMany({
          where: { userId, client: 'mobile', id: { notIn: keep.map((row) => row.id) } },
        });
      }
      return created;
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
