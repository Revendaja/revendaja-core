import { request } from './http';
import type { Coupon, CreateCouponInput, UpdateCouponInput } from './types';

// Cupons de desconto da loja. O cliente digita o código no carrinho da vitrine e o servidor aplica o
// desconto no pedido.
export function listCoupons() {
  return request<{ items: Coupon[] }>('/store/coupons', { auth: true });
}

// 409 se já existir um cupom com esse código na loja.
export function createCoupon(input: CreateCouponInput) {
  return request<Coupon>('/store/coupons', { method: 'POST', body: input, auth: true });
}

// Valor, mínimo, limite, validade ou ligar/desligar. Código e tipo não mudam.
export function updateCoupon(id: string, input: UpdateCouponInput) {
  return request<Coupon>(`/store/coupons/${id}`, { method: 'PATCH', body: input, auth: true });
}

// As vendas que usaram o cupom continuam com o desconto e o código.
export function deleteCoupon(id: string) {
  return request<null>(`/store/coupons/${id}`, { method: 'DELETE', auth: true });
}
