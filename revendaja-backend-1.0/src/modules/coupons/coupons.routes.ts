import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import {
  couponListResponseSchema,
  couponParamsSchema,
  couponPreviewResponseSchema,
  couponResponseSchema,
  createCouponSchema,
  storefrontCouponParamsSchema,
  updateCouponSchema,
  validateCouponSchema,
} from './coupons.schema';
import {
  createCoupon,
  deleteCoupon,
  listCoupons,
  previewCoupon,
  updateCoupon,
} from './coupons.controller';

const VERIFIED = requireVerified('Confirme seu e-mail antes de gerenciar a loja.');

// Conferir cupom é público e dá para tentar adivinhar códigos: limite mais curto que a navegação.
const PREVIEW_RATE_LIMIT = { max: 20, timeWindow: '1 minute' };

export async function couponsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // --- Painel da loja (login) ------------------------------------------------

  server.get(
    '/store/coupons',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['coupons'],
        summary: 'Lista os cupons de desconto da loja (mais novos primeiro).',
        security: [{ bearerAuth: [] }],
        response: { 200: couponListResponseSchema },
      },
    },
    listCoupons,
  );

  server.post(
    '/store/coupons',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['coupons'],
        summary:
          'Cria um cupom: código (único na loja), tipo percent/fixed, valor, pedido mínimo, limite de usos e validade (os três últimos opcionais).',
        security: [{ bearerAuth: [] }],
        body: createCouponSchema,
        response: { 201: couponResponseSchema },
      },
    },
    createCoupon,
  );

  server.patch(
    '/store/coupons/:id',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['coupons'],
        summary:
          'Edita valor, pedido mínimo, limite de usos, validade ou liga/desliga o cupom. Código e tipo não mudam.',
        security: [{ bearerAuth: [] }],
        params: couponParamsSchema,
        body: updateCouponSchema,
        response: { 200: couponResponseSchema },
      },
    },
    updateCoupon,
  );

  server.delete(
    '/store/coupons/:id',
    {
      preHandler: [authenticate, VERIFIED],
      schema: {
        tags: ['coupons'],
        summary: 'Apaga o cupom. As vendas que o usaram continuam com o desconto e o código.',
        security: [{ bearerAuth: [] }],
        params: couponParamsSchema,
      },
    },
    deleteCoupon,
  );

  // --- Vitrine (público) -----------------------------------------------------

  server.post(
    '/public/stores/:handle/coupons/validate',
    {
      config: { rateLimit: PREVIEW_RATE_LIMIT },
      schema: {
        tags: ['coupons'],
        summary:
          'Confere um cupom contra os itens do carrinho e devolve o desconto (o servidor calcula o subtotal; o uso só é consumido ao fazer o pedido).',
        params: storefrontCouponParamsSchema,
        body: validateCouponSchema,
        response: { 200: couponPreviewResponseSchema },
      },
    },
    previewCoupon,
  );
}
