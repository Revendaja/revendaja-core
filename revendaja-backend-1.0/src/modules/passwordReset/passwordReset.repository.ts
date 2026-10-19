import { prisma } from '../../database/prisma';
import type { PasswordResetCode } from './passwordReset.types';

interface CreateResetCodeData {
  userId: string;
  codeHash: string;
  expiresAt: Date;
}

export const passwordResetRepository = {
  create(data: CreateResetCodeData): Promise<PasswordResetCode> {
    return prisma.passwordResetCode.create({ data });
  },

  // O código que vale é o mais recente ainda não usado/invalidado.
  findLatestPending(userId: string): Promise<PasswordResetCode | null> {
    return prisma.passwordResetCode.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  findLastCreated(userId: string): Promise<PasswordResetCode | null> {
    return prisma.passwordResetCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  countCreatedSince(userId: string, since: Date): Promise<number> {
    return prisma.passwordResetCode.count({ where: { userId, createdAt: { gte: since } } });
  },

  // Reserva UMA tentativa de digitação, de forma atômica: é um único UPDATE que
  // só afeta a linha se o código ainda estiver válido (não usado, não expirado
  // e com tentativas sobrando) e já soma a tentativa. Isso é o que impede
  // burlar o limite mandando muitas tentativas em paralelo — se lêssemos o
  // contador e depois o incrementássemos, todas as requisições simultâneas
  // enxergariam "0 tentativas" e cada uma testaria um palpite. Devolve false
  // quando não há tentativa a reservar (nesse caso não se compara o código).
  async claimAttempt(id: string, maxAttempts: number): Promise<boolean> {
    const { count } = await prisma.passwordResetCode.updateMany({
      where: { id, usedAt: null, attempts: { lt: maxAttempts }, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    });
    return count === 1;
  },

  // Consome o código de forma atômica (`usedAt: null` no where): se dois
  // pedidos acertarem o mesmo código ao mesmo tempo, só um "ganha".
  async consume(id: string): Promise<boolean> {
    const { count } = await prisma.passwordResetCode.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  },

  // Invalida os códigos ainda pendentes da usuária (só o mais recente deve valer).
  async revokePending(userId: string): Promise<void> {
    await prisma.passwordResetCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  },
};

export type PasswordResetRepository = typeof passwordResetRepository;
