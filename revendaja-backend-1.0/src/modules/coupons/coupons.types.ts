export type CouponType = 'percent' | 'fixed';

export interface Coupon {
  id: string;
  // Sempre em MAIÚSCULAS ("VERAO10"), único por loja.
  code: string;
  type: CouponType;
  // percent: 1 a 100 (%); fixed: reais.
  value: number;
  // Pedido mínimo (soma dos produtos). null = sem mínimo.
  minOrder: number | null;
  // Limite de usos no total. null = ilimitado.
  maxUses: number | null;
  usedCount: number;
  // Último instante em que vale. null = não expira.
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateCouponData {
  code: string;
  type: CouponType;
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  expiresAt: Date | null;
}

// Só os campos presentes são gravados. Código e tipo não mudam depois de criado (pedidos antigos e
// o cliente que já recebeu o código dependem deles).
export interface UpdateCouponData {
  value?: number;
  minOrder?: number | null;
  maxUses?: number | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}

// O que o carrinho mostra ao conferir um cupom (valores em reais).
export interface CouponPreview {
  code: string;
  type: CouponType;
  value: number;
  subtotal: number;
  discount: number;
  total: number;
}
