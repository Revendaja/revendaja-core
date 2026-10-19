import { request } from './http';
import type { StorePlanId } from './types';

export type PaidPlanId = Exclude<StorePlanId, 'free'>;

export type BillingInvoice = {
  id: string;
  number: string | null;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  pdfUrl: string | null;
  hostedUrl: string | null;
};

// GET /billing: plano e status vêm do banco; cartão e faturas, da Stripe.
export type BillingOverview = {
  // false = o servidor ainda não tem a Stripe configurada (as ações de cobrança ficam indisponíveis).
  configured: boolean;
  plan: { id: StorePlanId; name: string };
  subscription: {
    // Status da Stripe: active, trialing, past_due, canceled...
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  // Downgrade já pedido que entra no fim do ciclo (a loja mantém o plano atual até lá).
  scheduledChange: { plan: StorePlanId; effectiveAt: string } | null;
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  billingEmail: string | null;
  invoices: BillingInvoice[];
};

export function getBilling() {
  return request<BillingOverview>('/billing', { auth: true });
}

export type CheckoutResult = {
  // Levar a usuária ao Checkout da Stripe (primeira assinatura).
  url: string | null;
  // Sem `url` e com data: downgrade agendado para o fim do ciclo. Os dois null: o plano mudou na
  // hora (upgrade, cobrando a diferença) ou um agendamento/cancelamento foi desfeito.
  scheduledFor: string | null;
};

// Com assinatura ativa, escolher o plano atual desfaz um cancelamento ou downgrade agendados.
// 402 = cartão recusado no upgrade; 409 = já está nesse plano.
export function startCheckout(plan: PaidPlanId) {
  return request<CheckoutResult>('/billing/checkout', {
    method: 'POST',
    body: { plan },
    auth: true,
  });
}

// Portal da Stripe: trocar cartão, baixar faturas e cancelar a assinatura.
export function createPortalSession() {
  return request<{ url: string }>('/billing/portal', { method: 'POST', auth: true });
}
