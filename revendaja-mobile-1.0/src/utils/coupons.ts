import type { Coupon } from '../api/types';
import { formatCurrency } from './format';

// "10% de desconto" / "R$ 20,00 de desconto".
export function couponDiscountLabel(coupon: Pick<Coupon, 'type' | 'value'>): string {
  const value = coupon.type === 'percent' ? `${coupon.value}%` : formatCurrency(coupon.value);
  return `${value} de desconto`;
}

export type CouponStatusKey = 'active' | 'off' | 'expired' | 'exhausted';

// Situação do cupom agora: desligado pela loja, vencido, com os usos esgotados ou valendo.
export function couponStatus(
  coupon: Pick<Coupon, 'isActive' | 'expiresAt' | 'maxUses' | 'usedCount'>,
  now: Date = new Date()
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
    coupon.maxUses === null
      ? `${coupon.usedCount} ${coupon.usedCount === 1 ? 'uso' : 'usos'}`
      : `${coupon.usedCount} de ${coupon.maxUses} usos`
  );
  if (coupon.expiresAt !== null) {
    const date = new Date(coupon.expiresAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    details.push(`Vale até ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`);
  }
  return details;
}

// Validade digitada (DD/MM/AAAA, opcional). Vazio = não vence. Vale até o FIM do dia escolhido (no fuso do
// aparelho), então "30/11" inclui o dia 30. Não aceita dia que já passou.
export function parseExpiryDate(text: string, now: Date = new Date()): { iso?: string; error?: string } {
  if (!text.trim()) return {};
  const invalid = { error: 'Data inválida. Use DD/MM/AAAA.' };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return invalid;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day, 23, 59, 59);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return invalid;
  if (date.getTime() <= now.getTime()) return { error: 'Escolha uma data de hoje em diante.' };
  return { iso: date.toISOString() };
}
