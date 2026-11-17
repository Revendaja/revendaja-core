import { toCents } from '../sales/sales.money';
import type { Coupon } from './coupons.types';

// Código do cupom: sem espaços e em maiúsculas, para "verao10 " e "VERAO10" serem o mesmo.
export function normalizeCouponCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

export type CouponRejection = 'not_found' | 'inactive' | 'expired' | 'exhausted' | 'min_order';

export type CouponCheck =
  { ok: true; discountCents: number } | { ok: false; reason: CouponRejection; message: string };

type CouponRules = Pick<
  Coupon,
  'type' | 'value' | 'minOrder' | 'maxUses' | 'usedCount' | 'expiresAt' | 'isActive'
>;

// "R$ 1.234,50" para as mensagens.
function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Quanto o cupom abate de um pedido de `subtotalCents` (centavos). Percentual arredonda para o centavo;
// valor fixo nunca passa do total (o pedido não fica negativo).
export function discountFor(coupon: Pick<Coupon, 'type' | 'value'>, subtotalCents: number): number {
  const raw =
    coupon.type === 'percent'
      ? Math.round((subtotalCents * coupon.value) / 100)
      : toCents(coupon.value);
  return Math.max(0, Math.min(raw, subtotalCents));
}

// Confere se o cupom vale para um pedido de `subtotalCents` AGORA. Mensagens genéricas para cupom que
// não existe ou está desligado (não ajuda quem tenta adivinhar códigos).
export function evaluateCoupon(
  coupon: CouponRules | null,
  subtotalCents: number,
  now: Date,
): CouponCheck {
  const invalid = {
    ok: false as const,
    reason: 'not_found' as const,
    message: 'Cupom inválido ou expirado.',
  };
  if (!coupon) return invalid;
  if (!coupon.isActive) return { ...invalid, reason: 'inactive' };
  if (coupon.expiresAt !== null && coupon.expiresAt.getTime() < now.getTime()) {
    return { ...invalid, reason: 'expired' };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: 'exhausted', message: 'Este cupom já atingiu o limite de usos.' };
  }
  if (coupon.minOrder !== null && subtotalCents < toCents(coupon.minOrder)) {
    return {
      ok: false,
      reason: 'min_order',
      message: `Este cupom vale para pedidos a partir de ${brl(coupon.minOrder)}.`,
    };
  }
  const discountCents = discountFor(coupon, subtotalCents);
  if (discountCents <= 0) return invalid;
  return { ok: true, discountCents };
}
