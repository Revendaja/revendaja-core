import Stripe from 'stripe';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';

let client: Stripe | null = null;

export function isBillingConfigured(): boolean {
  return env.STRIPE_SECRET_KEY !== undefined;
}

// Cliente criado sob demanda: sem STRIPE_SECRET_KEY a API sobe normalmente e só as rotas de
// cobrança respondem 503. Sem `apiVersion` de propósito: vale a versão fixada pelo SDK instalado,
// que é a que os tipos descrevem (atualizar o SDK é como se muda de versão).
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(
      'A cobrança ainda não está configurada. Fale com o suporte.',
      503,
      'BILLING_NOT_CONFIGURED',
    );
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    appInfo: { name: 'revendaja-backend', version: '1.0.0' },
  });
  return client;
}
