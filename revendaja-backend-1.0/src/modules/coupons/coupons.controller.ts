import type { FastifyReply, FastifyRequest } from 'fastify';
import { couponsService } from './coupons.service';
import type {
  CouponParams,
  CreateCouponInput,
  StorefrontCouponParams,
  UpdateCouponInput,
  ValidateCouponInput,
} from './coupons.schema';

export async function listCoupons(request: FastifyRequest, reply: FastifyReply) {
  const items = await couponsService.list(request.userId as string);
  return reply.send({ items });
}

export async function createCoupon(
  request: FastifyRequest<{ Body: CreateCouponInput }>,
  reply: FastifyReply,
) {
  const coupon = await couponsService.create(request.userId as string, request.body);
  return reply.status(201).send(coupon);
}

export async function updateCoupon(
  request: FastifyRequest<{ Params: CouponParams; Body: UpdateCouponInput }>,
  reply: FastifyReply,
) {
  const coupon = await couponsService.update(
    request.userId as string,
    request.params.id,
    request.body,
  );
  return reply.send(coupon);
}

export async function deleteCoupon(
  request: FastifyRequest<{ Params: CouponParams }>,
  reply: FastifyReply,
) {
  await couponsService.remove(request.userId as string, request.params.id);
  return reply.status(204).send();
}

export async function previewCoupon(
  request: FastifyRequest<{ Params: StorefrontCouponParams; Body: ValidateCouponInput }>,
  reply: FastifyReply,
) {
  const preview = await couponsService.preview(request.params.handle, request.body);
  return reply.send(preview);
}
