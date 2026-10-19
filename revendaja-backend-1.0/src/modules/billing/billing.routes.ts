import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import {
  billingOverviewResponseSchema,
  checkoutResponseSchema,
  checkoutSchema,
  portalResponseSchema,
} from './billing.schema';
import { createPortal, getBilling, startCheckout, stripeWebhook } from './billing.controller';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [
    authenticate,
    requireVerified('Confirme seu e-mail antes de assinar um plano.'),
  ];

  server.get(
    '/billing',
    {
      preHandler,
      schema: {
        tags: ['billing'],
        summary:
          'Cobrança da loja: plano, status da assinatura, cartão e faturas (lidos da Stripe quando há cliente).',
        security: [{ bearerAuth: [] }],
        response: { 200: billingOverviewResponseSchema },
      },
    },
    getBilling,
  );

  server.post(
    '/billing/checkout',
    {
      preHandler,
      schema: {
        tags: ['billing'],
        summary:
          'Assina um plano pago. Devolve a URL do Checkout da Stripe; se a loja já tem assinatura ativa, troca o plano na hora e devolve url null.',
        security: [{ bearerAuth: [] }],
        body: checkoutSchema,
        response: { 200: checkoutResponseSchema },
      },
    },
    startCheckout,
  );

  server.post(
    '/billing/portal',
    {
      preHandler,
      schema: {
        tags: ['billing'],
        summary: 'URL do portal da Stripe (cartão, faturas e cancelamento).',
        security: [{ bearerAuth: [] }],
        response: { 200: portalResponseSchema },
      },
    },
    createPortal,
  );

  // Webhook num escopo próprio: a assinatura da Stripe é calculada sobre o corpo cru, então só
  // aqui o JSON NÃO é parseado (as outras rotas seguem recebendo objeto).
  await app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
    webhookScope.post('/billing/webhook', { schema: { hide: true } }, stripeWebhook);
  });
}
