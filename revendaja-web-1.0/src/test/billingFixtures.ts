import type { BillingOverview } from '@/lib/api/billing';
import type { StorePlanId, StorePlanUsage } from '@/lib/api/types';
import { findPlan } from '@/lib/data/plans';

// Resposta de GET /billing para os testes: por padrão, plano Pro ativo, renovando em 12/11/2026.
export function billingOverview(overrides: Partial<BillingOverview> & { planId?: StorePlanId } = {}): BillingOverview {
  const planId = overrides.planId ?? 'premium';
  const paid = planId !== 'free';
  return {
    configured: true,
    plan: { id: planId, name: findPlan(planId).name },
    subscription: paid
      ? { status: 'active', currentPeriodEnd: '2026-11-12T12:00:00.000Z', cancelAtPeriodEnd: false }
      : null,
    scheduledChange: null,
    paymentMethod: paid ? { brand: 'visa', last4: '4242', expMonth: 3, expYear: 2030 } : null,
    billingEmail: paid ? 'ana@exemplo.com' : null,
    invoices: [],
    ...overrides,
  };
}

// Resposta de GET /store/plan: quantos produtos a loja tem (e quantos estão congelados).
export function planUsage(products: number, planId: StorePlanId = 'premium', frozen = 0): StorePlanUsage {
  const plan = findPlan(planId);
  return {
    plan: { id: planId, name: plan.name },
    limits: {
      maxProducts: plan.maxProducts,
      manualProductsEnabled: planId !== 'free',
      categoriesEnabled: planId !== 'free',
      promotionsEnabled: planId !== 'free',
    },
    usage: { products, frozen },
  };
}
