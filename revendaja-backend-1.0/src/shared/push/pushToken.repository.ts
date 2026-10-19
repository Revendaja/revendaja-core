import { prisma } from '../../database/prisma';

export type PushPlatform = 'ios' | 'android';

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: PushPlatform | null;
  createdAt: Date;
  updatedAt: Date;
}

export const pushTokenRepository = {
  // Upsert por `token` (não por `userId` + `token`): se o mesmo aparelho logar em outra conta, o
  // registro migra para o novo usuário em vez de duplicar.
  upsert(userId: string, token: string, platform: PushPlatform | null = null): Promise<PushToken> {
    return prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  },

  // Escopado por `userId`: garante que uma usuária só remove os próprios tokens. Devolve false se
  // o token não existe ou é de outro usuário (o controller trata isso como 404).
  async deleteByUserAndToken(userId: string, token: string): Promise<boolean> {
    const result = await prisma.pushToken.deleteMany({ where: { userId, token } });
    return result.count === 1;
  },

  async findTokensByUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    return rows.map((row) => row.token);
  },

  // Usado pelo PushNotificationService quando o Expo devolve "DeviceNotRegistered": o token não
  // serve mais, então some do banco (qualquer usuário que o tenha).
  deleteByToken(token: string): Promise<unknown> {
    return prisma.pushToken.deleteMany({ where: { token } });
  },
};

export type PushTokenRepository = typeof pushTokenRepository;
