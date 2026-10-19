import type { FastifyReply, FastifyRequest } from 'fastify';
import { catalogService } from './catalog.service';
import type { CatalogProductParams, ListCatalogProductsQuery } from './catalog.schema';

export async function listBrands(_request: FastifyRequest, reply: FastifyReply) {
  const brands = await catalogService.listBrands();
  return reply.send(brands);
}

export async function listProducts(
  request: FastifyRequest<{ Querystring: ListCatalogProductsQuery }>,
  reply: FastifyReply,
) {
  const result = await catalogService.listProducts(request.query);
  return reply.send(result);
}

export async function getProduct(
  request: FastifyRequest<{ Params: CatalogProductParams }>,
  reply: FastifyReply,
) {
  const product = await catalogService.getProduct(request.params.id);
  return reply.send(product);
}
