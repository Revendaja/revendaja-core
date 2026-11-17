import type { Coupon } from '@/lib/api/types';
import { formatCurrency } from './format';

// "10% de desconto" / "R$ 20,00 de desconto".
export function couponDiscountLabel(coupon: Pick<Coupon, 'type' | 'value'>): string {
  const value = coupon.type === 'percent' ? `${coupon.value.toLocaleString('pt-BR')}%` : formatCurrency(coupon.value);
  return `${value} de desconto`;
}

export type CouponStatusKey = 'active' | 'off' | 'expired' | 'exhausted';

// Situação do cupom agora: desligado pela loja, vencido, com os usos esgotados ou valendo.
export function couponStatus(
  coupon: Pick<Coupon, 'isActive' | 'expiresAt' | 'maxUses' | 'usedCount'>,
  now: Date = new Date(),
): { key: CouponStatusKey; label: string } {
  if (!coupon.isActive) return { key: 'off', label: 'Desligado' };
  if (coupon.expiresAt !== null && new Date(coupon.expiresAt).getTime() < now.getTime()) {
    return { key: 'expired', label: 'Vencido' };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { key: 'exhausted', label: 'Esgotado' };
  return { key: 'active', label: 'Ativo' };
}

// Linhas de detalhe do cartão: mínimo, usos e validade.
export function couponDetails(coupon: Coupon): string[] {
  const details: string[] = [];
  if (coupon.minOrder !== null) details.push(`Pedido mínimo ${formatCurrency(coupon.minOrder)}`);
  details.push(
    coupon.maxUses === null ? `${coupon.usedCount} ${coupon.usedCount === 1 ? 'uso' : 'usos'}` : `${coupon.usedCount} de ${coupon.maxUses} usos`,
  );
  if (coupon.expiresAt !== null) {
    details.push(`Vale até ${new Date(coupon.expiresAt).toLocaleDateString('pt-BR')}`);
  }
  return details;
}

// Data escolhida (AAAA-MM-DD) -> o fim desse dia, no fuso local, em ISO: "vale até 30/11" inclui o dia 30.
export function endOfDayIso(dateInput: string): string | null {
  const [y, m, d] = dateInput.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, 23, 59, 59);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
