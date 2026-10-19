import type { FastifyReply, FastifyRequest } from 'fastify';
import { storefrontService } from './storefront.service';
import type { OnlineOrderBody, StorefrontParams, StorefrontQuery } from './storefront.schema';
import type { UpdateStorefrontConfigInput } from './storefront.config';

export async function getStorefront(
  request: FastifyRequest<{ Params: StorefrontParams; Querystring: StorefrontQuery }>,
  reply: FastifyReply,
) {
  const storefront = await storefrontService.getStorefront(request.params.handle, request.query);
  return reply.send(storefront);
}

export async function recordVisit(
  request: FastifyRequest<{ Params: StorefrontParams }>,
  reply: FastifyReply,
) {
  await storefrontService.recordVisit(request.params.handle);
  return reply.status(204).send();
}

export async function createOnlineOrder(
  request: FastifyRequest<{ Params: StorefrontParams; Body: OnlineOrderBody }>,
  reply: FastifyReply,
) {
  const { order, created } = await storefrontService.createOrder(
    request.params.handle,
    request.body,
  );
  // 201 quando o pedido foi criado agora; 200 quando o site repetiu o mesmo clientRequestId e
  // recebeu de volta o pedido que já existia.
  return reply.status(created ? 201 : 200).send(order);
}

export async function getStoreStats(request: FastifyRequest, reply: FastifyReply) {
  const stats = await storefrontService.getStats(request.userId as string);
  return reply.send(stats);
}

export async function getStorefrontHome(
  request: FastifyRequest<{ Params: StorefrontParams }>,
  reply: FastifyReply,
) {
  return reply.send(await storefrontService.getHome(request.params.handle));
}

export async function getStorefrontCustomization(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await storefrontService.getCustomization(request.userId as string));
}

export async function updateStorefrontCustomization(
  request: FastifyRequest<{ Body: UpdateStorefrontConfigInput }>,
  reply: FastifyReply,
) {
  return reply.send(
    await storefrontService.updateCustomization(request.userId as string, request.body),
  );
}
