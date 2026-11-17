import { z } from 'zod';
import { normalizeCouponCode } from './coupons.discount';
import { saleItemsSchema } from '../sales/sales.schema';

// Teto do valor em reais: cabe em DECIMAL(10,2).
const MAX_VALUE = 99_999_999;
const MAX_USES = 1_000_000;

export const couponTypeSchema = z.enum(['percent', 'fixed']);

const codeSchema = z
  .string()
  .transform(normalizeCouponCode)
  .pipe(z.string().regex(/^[A-Z0-9_-]{3,20}$/, 'Use de 3 a 20 letras, números, "-" ou "_".'));

const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const createCouponSchema = z
  .object({
    code: codeSchema,
    type: couponTypeSchema,
    value: z.number().positive().max(MAX_VALUE),
    minOrder: z.number().positive().max(MAX_VALUE).nullish(),
    maxUses: z.number().int().min(1).max(MAX_USES).nullish(),
    expiresAt: isoDate.nullish(),
  })
  .refine((data) => data.type !== 'percent' || data.value <= 100, {
    message: 'O desconto percentual vai de 1% a 100%.',
    path: ['value'],
  });

// Código e tipo não mudam. `null` tira o mínimo / o limite / a validade.
export const updateCouponSchema = z
  .object({
    value: z.number().positive().max(MAX_VALUE).optional(),
    minOrder: z.number().positive().max(MAX_VALUE).nullable().optional(),
    maxUses: z.number().int().min(1).max(MAX_USES).nullable().optional(),
    expiresAt: isoDate.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para alterar.',
  });

export const couponParamsSchema = z.object({ id: z.string().uuid() });

export const couponResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: couponTypeSchema,
  value: z.number(),
  minOrder: z.number().nullable(),
  maxUses: z.number().int().nullable(),
  usedCount: z.number().int(),
  expiresAt: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
});

export const couponListResponseSchema = z.object({ items: z.array(couponResponseSchema) });

// Conferir um cupom no carrinho: o cliente manda o código e os itens; o servidor calcula o subtotal
// com os preços da loja (nunca confia em valor vindo do navegador).
export const validateCouponSchema = z.object({
  code: z.string().min(1).max(40).transform(normalizeCouponCode),
  items: saleItemsSchema,
});

export const storefrontCouponParamsSchema = z.object({ handle: z.string().min(1).max(60) });

export const couponPreviewResponseSchema = z.object({
  code: z.string(),
  type: couponTypeSchema,
  value: z.number(),
  subtotal: z.number(),
  discount: z.number(),
  total: z.number(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type CouponParams = z.infer<typeof couponParamsSchema>;
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
export type StorefrontCouponParams = z.infer<typeof storefrontCouponParamsSchema>;
