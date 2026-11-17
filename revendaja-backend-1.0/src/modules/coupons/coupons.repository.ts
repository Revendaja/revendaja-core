import type { Coupon as CouponRow } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { toCents } from '../sales/sales.money';
import type { Coupon, CouponType, CreateCouponData, UpdateCouponData } from './coupons.types';

export function mapCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type as CouponType,
    value: row.value.toNumber(),
    minOrder: row.minOrder === null ? null : row.minOrder.toNumber(),
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

// Tudo escopado por `storeId` na própria query: uma loja nunca enxerga cupom de outra.
export const couponsRepository = {
  async list(storeId: string): Promise<Coupon[]> {
    const rows = await prisma.coupon.findMany({
      where: { storeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(mapCoupon);
  },

  async findById(storeId: string, id: string): Promise<Coupon | null> {
    const row = await prisma.coupon.findFirst({ where: { id, storeId } });
    return row ? mapCoupon(row) : null;
  },

  async findByCode(storeId: string, code: string): Promise<Coupon | null> {
    const row = await prisma.coupon.findUnique({ where: { storeId_code: { storeId, code } } });
    return row ? mapCoupon(row) : null;
  },

  // O código é único por loja: repetir dá violação de índice único (o service vira 409).
  async create(storeId: string, data: CreateCouponData): Promise<Coupon> {
    const row = await prisma.coupon.create({ data: { storeId, ...data } });
    return mapCoupon(row);
  },

  async update(storeId: string, id: string, data: UpdateCouponData): Promise<Coupon | null> {
    const { count } = await prisma.coupon.updateMany({ where: { id, storeId }, data });
    if (count === 0) return null;
    return couponsRepository.findById(storeId, id);
  },

  // Vendas que usaram o cupom ficam (o `couponId` delas vira null; o `couponCode` copiado continua).
  async remove(storeId: string, id: string): Promise<boolean> {
    const { count } = await prisma.coupon.deleteMany({ where: { id, storeId } });
    return count === 1;
  },

  // Soma dos produtos do carrinho em centavos, com o preço ATUAL da loja (promoção vigente incluída),
  // igual ao cálculo da venda. null = algum produto não existe, não está na vitrine ou o carrinho
  // está vazio (o cupom não se aplica a um pedido que nem pode ser feito).
  async cartSubtotalCents(
    storeId: string,
    items: { storeProductId: string; quantity: number }[],
    now: Date,
  ): Promise<number | null> {
    const products = await prisma.storeProduct.findMany({
      where: {
        id: { in: items.map((item) => item.storeProductId) },
        storeId,
        isActive: true,
        frozen: false,
      },
      select: { id: true, price: true, promoPrice: true, promoEndsAt: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    let total = 0;
    for (const item of items) {
      const product = byId.get(item.storeProductId);
      if (!product) return null;
      const promoValid =
        product.promoPrice !== null && product.promoEndsAt !== null && product.promoEndsAt > now;
      const price = promoValid && product.promoPrice !== null ? product.promoPrice : product.price;
      total += toCents(price.toNumber()) * item.quantity;
    }
    return total > 0 ? total : null;
  },
};

export type CouponsRepository = typeof couponsRepository;
