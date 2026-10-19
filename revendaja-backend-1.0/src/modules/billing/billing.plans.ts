import { env } from '../../config/env';
import type { StorePlan } from '../store/store.types';

// Planos que têm cobrança. O Gratuito não tem preço na Stripe: é o estado de quem não tem
// assinatura ativa.
export type PaidPlan = Exclude<StorePlan, 'free'>;

export const PAID_PLANS = ['starter', 'premium', 'business'] as const satisfies readonly PaidPlan[];

function priceIds(): Record<PaidPlan, string | undefined> {
  return {
    starter: env.STRIPE_PRICE_STARTER,
    premium: env.STRIPE_PRICE_PREMIUM,
    business: env.STRIPE_PRICE_BUSINESS,
  };
}

// Id do preço (price_...) do plano na Stripe. undefined = ainda não configurado no ambiente.
export function priceIdForPlan(plan: PaidPlan): string | undefined {
  return priceIds()[plan];
}

// Caminho inverso: de qual plano é esse preço? undefined = preço que a API não conhece.
export function planForPriceId(priceId: string): PaidPlan | undefined {
  return PAID_PLANS.find((plan) => priceIds()[plan] === priceId);
}

const PLAN_RANK: Record<StorePlan, number> = { free: 0, starter: 1, premium: 2, business: 3 };

// Ir para um plano mais caro? (Decide como cobrar a troca: upgrade cobra a diferença na hora,
// downgrade vira crédito proporcional na próxima fatura.)
export function isUpgrade(from: StorePlan, to: PaidPlan): boolean {
  return PLAN_RANK[to] > PLAN_RANK[from];
}

// Estados em que a loja mantém o acesso ao plano pago. `past_due` continua com acesso enquanto a
// Stripe tenta cobrar de novo (se as tentativas acabam, a assinatura vira `canceled`/`unpaid`).
const ACCESS_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

export function hasPlanAccess(status: string | null | undefined): boolean {
  return status != null && ACCESS_STATUSES.has(status);
}
