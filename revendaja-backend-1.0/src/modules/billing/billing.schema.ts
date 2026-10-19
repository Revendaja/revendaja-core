import { z } from 'zod';
import { PAID_PLANS } from './billing.plans';

export const checkoutSchema = z.object({
  plan: z.enum(PAID_PLANS),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

const planSchema = z.object({
  id: z.enum(['free', 'starter', 'premium', 'business']),
  name: z.string(),
});

export const billingOverviewResponseSchema = z.object({
  configured: z.boolean(),
  plan: planSchema,
  subscription: z
    .object({
      status: z.string(),
      currentPeriodEnd: z.string().nullable(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
  scheduledChange: z
    .object({
      plan: z.enum(['free', 'starter', 'premium', 'business']),
      effectiveAt: z.string(),
    })
    .nullable(),
  paymentMethod: z
    .object({
      brand: z.string(),
      last4: z.string(),
      expMonth: z.number(),
      expYear: z.number(),
    })
    .nullable(),
  billingEmail: z.string().nullable(),
  invoices: z.array(
    z.object({
      id: z.string(),
      number: z.string().nullable(),
      date: z.string(),
      amount: z.number(),
      currency: z.string(),
      status: z.enum(['paid', 'open', 'void', 'uncollectible']),
      pdfUrl: z.string().nullable(),
      hostedUrl: z.string().nullable(),
    }),
  ),
});

// `url` é para onde levar a usuária (Checkout). null = a assinatura já existia e o plano foi
// trocado na hora, sem passar pelo Checkout.
// Sem `url`: se `scheduledFor` veio, é um downgrade agendado para essa data (fim do ciclo).
export const checkoutResponseSchema = z.object({
  url: z.string().nullable(),
  scheduledFor: z.string().nullable(),
});
export const portalResponseSchema = z.object({ url: z.string() });
export const webhookResponseSchema = z.object({ received: z.literal(true) });
