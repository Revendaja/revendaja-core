import { prisma } from '../../database/prisma';
import type { BillingStore, SubscriptionSnapshot } from './billing.types';

const storeSelect = {
  id: true,
  userId: true,
  plan: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  subscriptionStatus: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  user: { select: { name: true, email: true } },
} as const;

export class BillingRepository {
  async findStoreByUserId(userId: string): Promise<BillingStore | null> {
    return prisma.store.findUnique({ where: { userId }, select: storeSelect });
  }

  async findStoreById(id: string): Promise<BillingStore | null> {
    return prisma.store.findUnique({ where: { id }, select: storeSelect });
  }

  async findStoreByCustomerId(stripeCustomerId: string): Promise<BillingStore | null> {
    return prisma.store.findUnique({ where: { stripeCustomerId }, select: storeSelect });
  }

  async setCustomerId(storeId: string, stripeCustomerId: string): Promise<void> {
    await prisma.store.update({ where: { id: storeId }, data: { stripeCustomerId } });
  }

  // Aplica o estado da assinatura na loja (inclusive o plano que ela pode usar).
  async applySubscription(storeId: string, snapshot: SubscriptionSnapshot): Promise<void> {
    await prisma.store.update({ where: { id: storeId }, data: snapshot });
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    const found = await prisma.stripeWebhookEvent.findUnique({ where: { id: eventId } });
    return found !== null;
  }

  // Idempotente: um reenvio concorrente do mesmo evento não estoura em chave duplicada.
  async markEventProcessed(eventId: string, type: string): Promise<void> {
    await prisma.stripeWebhookEvent.upsert({
      where: { id: eventId },
      create: { id: eventId, type },
      update: {},
    });
  }
}

export const billingRepository = new BillingRepository();
