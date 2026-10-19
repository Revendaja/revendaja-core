import type { FastifyReply, FastifyRequest } from 'fastify';
import { salesService } from './sales.service';
import type {
  CreateSaleInput,
  ListSalesQuery,
  SaleParams,
  SalesSummaryQuery,
  SalesTimelineQuery,
  StaleProductsQuery,
  TopBrandsQuery,
  TopProductsQuery,
  UpdateSaleStatusBody,
} from './sales.schema';

export async function createSale(
  request: FastifyRequest<{ Body: CreateSaleInput }>,
  reply: FastifyReply,
) {
  const { sale, created } = await salesService.create(request.userId as string, request.body);
  // 201 quando a venda foi criada agora; 200 quando o app repetiu o mesmo
  // clientRequestId e recebeu de volta a venda que já existia.
  return reply.status(created ? 201 : 200).send(sale);
}

export async function listSales(
  request: FastifyRequest<{ Querystring: ListSalesQuery }>,
  reply: FastifyReply,
) {
  const result = await salesService.list(request.userId as string, request.query);
  return reply.send(result);
}

export async function getSalesSummary(
  request: FastifyRequest<{ Querystring: SalesSummaryQuery }>,
  reply: FastifyReply,
) {
  const { from, to, source } = request.query;
  const summary = await salesService.summary(request.userId as string, from, to, source);
  return reply.send(summary);
}

export async function getSalesTimeline(
  request: FastifyRequest<{ Querystring: SalesTimelineQuery }>,
  reply: FastifyReply,
) {
  const timeline = await salesService.timeline(request.userId as string, request.query);
  return reply.send(timeline);
}

export async function getTopProducts(
  request: FastifyRequest<{ Querystring: TopProductsQuery }>,
  reply: FastifyReply,
) {
  const { from, to, limit } = request.query;
  const items = await salesService.topProducts(request.userId as string, from, to, limit);
  return reply.send({ items });
}

export async function getTopBrands(
  request: FastifyRequest<{ Querystring: TopBrandsQuery }>,
  reply: FastifyReply,
) {
  const { from, to, limit } = request.query;
  const items = await salesService.topBrands(request.userId as string, from, to, limit);
  return reply.send({ items });
}

export async function getStaleProducts(
  request: FastifyRequest<{ Querystring: StaleProductsQuery }>,
  reply: FastifyReply,
) {
  const { days, limit } = request.query;
  const items = await salesService.staleProducts(request.userId as string, days, limit);
  return reply.send({ items });
}

export async function getSale(
  request: FastifyRequest<{ Params: SaleParams }>,
  reply: FastifyReply,
) {
  const sale = await salesService.get(request.userId as string, request.params.id);
  return reply.send(sale);
}

export async function updateSaleStatus(
  request: FastifyRequest<{ Params: SaleParams; Body: UpdateSaleStatusBody }>,
  reply: FastifyReply,
) {
  const userId = request.userId as string;
  const { id } = request.params;
  const sale =
    request.body.status === 'paid'
      ? await salesService.markPaid(userId, id)
      : await salesService.cancel(userId, id);
  return reply.send(sale);
}
