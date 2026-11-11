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

  // Cria a sessão da usuária ou SUBSTITUI a que já existe PARA O MESMO TIPO DE APARELHO. É aqui
  // que "uma sessão por aparelho (web / mobile)" acontece: `(userId, client)` é único, então o
  // upsert nunca gera duas linhas do mesmo tipo, e o `id` novo invalida todos os tokens anteriores
  // daquele tipo. A sessão do outro tipo não é tocada.
  replaceForUser(
    userId: string,
    sessionId: string,
    expiresAt: Date,
    client: SessionClient = 'mobile',
  ): Promise<Session> {
    return prisma.session.upsert({
      where: { userId_client: { userId, client } },
      create: { id: sessionId, userId, client, expiresAt },
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
