import type { FastifyReply, FastifyRequest } from 'fastify';
import { billingService } from './billing.service';
import type { CheckoutInput } from './billing.schema';

export async function getBilling(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await billingService.getOverview(request.userId as string));
}

export async function startCheckout(
  request: FastifyRequest<{ Body: CheckoutInput }>,
  reply: FastifyReply,
) {
  return reply.send(
    await billingService.startCheckout(request.userId as string, request.body.plan),
  );
}

export async function createPortal(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await billingService.createPortalSession(request.userId as string));
}

// O corpo chega como Buffer (parser cru registrado em billing.routes.ts).
export async function stripeWebhook(request: FastifyRequest, reply: FastifyReply) {
  const signature = request.headers['stripe-signature'];
  await billingService.handleWebhook(
    request.body as Buffer,
    typeof signature === 'string' ? signature : undefined,
  );
  return reply.send({ received: true });
}
