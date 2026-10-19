import { prisma } from '../../database/prisma';
import type { OtpCode } from './otp.types';

interface CreateOtpData {
  userId: string;
  codeHash: string;
  expiresAt: Date;
}

export const otpRepository = {
  create(data: CreateOtpData): Promise<OtpCode> {
    return prisma.otpCode.create({ data });
  },

  // O código válido pra verificar é sempre o mais recente ainda não
  // consumido (resend expira os anteriores, então normalmente só existe um).
  findLatestPending(userId: string): Promise<OtpCode | null> {
    return prisma.otpCode.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  findLastCreated(userId: string): Promise<OtpCode | null> {
    return prisma.otpCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  countCreatedSince(userId: string, since: Date): Promise<number> {
    return prisma.otpCode.count({ where: { userId, createdAt: { gte: since } } });
  },

  // Reserva UMA tentativa de digitação, de forma atômica: um único UPDATE que só afeta a linha se
  // ela ainda estiver válida (não consumida, não expirada e com tentativas sobrando) e já soma a
  // tentativa. Sem isso — ler `attempts` e só incrementar depois de comparar o código, como era
  // antes —, tentativas em paralelo leem o mesmo contador e todas chegam a testar um palpite,
  // furando `OTP_MAX_ATTEMPTS` (mesmo padrão de `passwordResetRepository.claimAttempt`). Devolve
  // false quando não há tentativa a reservar (nesse caso não se compara o código).
  async claimAttempt(id: string, maxAttempts: number): Promise<boolean> {
    const { count } = await prisma.otpCode.updateMany({
      where: { id, consumedAt: null, attempts: { lt: maxAttempts }, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    });
    return count === 1;
  },

  markConsumed(id: string): Promise<OtpCode> {
    return prisma.otpCode.update({ where: { id }, data: { consumedAt: new Date() } });
  },

  expirePending(userId: string): Promise<{ count: number }> {
    return prisma.otpCode.updateMany({
      where: { userId, consumedAt: null },
      data: { expiresAt: new Date() },
    });
  },
};

export type OtpRepository = typeof otpRepository;
