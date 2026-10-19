import type { StorePlan } from '../store/store.types';

// A loja com o que a cobrança precisa saber dela (e do dono, para o cadastro do cliente na Stripe).
export interface BillingStore {
  id: string;
  userId: string;
  plan: StorePlan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  user: { name: string; email: string };
}

export interface SubscriptionSnapshot {
  plan: StorePlan;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingOverview {
  // false = ambiente sem Stripe configurada (a UI esconde ações de cobrança).
  configured: boolean;
  plan: { id: StorePlan; name: string };
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  // Downgrade já pedido que entra no fim do ciclo (a loja mantém o plano atual até lá).
  scheduledChange: { plan: StorePlan; effectiveAt: string } | null;
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  billingEmail: string | null;
  invoices: BillingInvoice[];
}

export interface BillingInvoice {
  id: string;
  number: string | null;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  pdfUrl: string | null;
  hostedUrl: string | null;
}
