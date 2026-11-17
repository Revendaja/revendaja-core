import { isUniqueViolation } from '../../database/errors';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError';
import { fromCents } from '../sales/sales.money';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import type { Store } from '../store/store.types';
import type { CreateCouponInput, UpdateCouponInput, ValidateCouponInput } from './coupons.schema';
import { evaluateCoupon } from './coupons.discount';
import { couponsRepository, type CouponsRepository } from './coupons.repository';
import type { Coupon, CouponPreview, UpdateCouponData } from './coupons.types';

type StoreLookup = Pick<StoreRepository, 'findByUserId' | 'findByHandle'>;

export class CouponsService {
  constructor(
    private readonly repository: CouponsRepository = couponsRepository,
    private readonly stores: StoreLookup = storeRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(userId: string): Promise<Coupon[]> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.repository.list(store.id);
  }

  async create(userId: string, input: CreateCouponInput): Promise<Coupon> {
    const store = await this.getOwnStoreOrThrow(userId);
    if (input.expiresAt && input.expiresAt.getTime() <= this.now().getTime()) {
      throw new AppError(
        'A validade do cupom precisa ser no futuro.',
        400,
        'COUPON_EXPIRES_IN_PAST',
      );
    }

    try {
      return await this.repository.create(store.id, {
        code: input.code,
        type: input.type,
        value: input.value,
        minOrder: input.minOrder ?? null,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresAt ?? null,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictError('Você já tem um cupom com esse código.');
      throw error;
    }
  }

  // Edita o que pode mudar (valor, mínimo, limite, validade, ligado/desligado). Código e tipo ficam.
  async update(userId: string, couponId: string, input: UpdateCouponInput): Promise<Coupon> {
    const store = await this.getOwnStoreOrThrow(userId);
    const current = await this.repository.findById(store.id, couponId);
    if (!current) throw new NotFoundError('Cupom não encontrado.');

    if (input.value !== undefined && current.type === 'percent' && input.value > 100) {
      throw new AppError('O desconto percentual vai de 1% a 100%.', 400, 'COUPON_PERCENT_TOO_HIGH');
    }
    if (input.expiresAt && input.expiresAt.getTime() <= this.now().getTime()) {
      throw new AppError(
        'A validade do cupom precisa ser no futuro.',
        400,
        'COUPON_EXPIRES_IN_PAST',
      );
    }
    // Reduzir o limite para menos do que já foi usado só esgota o cupom: permitido.

    const data: UpdateCouponData = {};
    if (input.value !== undefined) data.value = input.value;
    if (input.minOrder !== undefined) data.minOrder = input.minOrder;
    if (input.maxUses !== undefined) data.maxUses = input.maxUses;
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await this.repository.update(store.id, couponId, data);
    if (!updated) throw new NotFoundError('Cupom não encontrado.');
    return updated;
  }

  async remove(userId: string, couponId: string): Promise<void> {
    const store = await this.getOwnStoreOrThrow(userId);
    const removed = await this.repository.remove(store.id, couponId);
    if (!removed) throw new NotFoundError('Cupom não encontrado.');
  }

  // Público (carrinho da vitrine): confere o cupom contra os itens do carrinho e devolve quanto
  // abate. Não consome o uso: isso só acontece ao fazer o pedido.
  async preview(handle: string, input: ValidateCouponInput): Promise<CouponPreview> {
    const store = await this.stores.findByHandle(handle);
    if (!store) throw new AppError('Loja não encontrada.', 404, 'STORE_NOT_FOUND');
    if (!store.isOnline)
      throw new AppError('Esta loja está temporariamente indisponível.', 404, 'STORE_OFFLINE');

    const now = this.now();
    const coupon = await this.repository.findByCode(store.id, input.code);
    const subtotalCents = await this.repository.cartSubtotalCents(store.id, input.items, now);
    if (subtotalCents === null) {
      throw new AppError(
        'Um dos produtos não está mais disponível nesta loja.',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }

    const check = evaluateCoupon(coupon, subtotalCents, now);
    if (!check.ok || !coupon)
      throw new AppError(
        check.ok ? 'Cupom inválido ou expirado.' : check.message,
        400,
        'COUPON_INVALID',
      );

    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      subtotal: fromCents(subtotalCents),
      discount: fromCents(check.discountCents),
      total: fromCents(subtotalCents - check.discountCents),
    };
  }

  private async getOwnStoreOrThrow(userId: string): Promise<Store> {
    const store = await this.stores.findByUserId(userId);
    if (!store) throw new NotFoundError('Você ainda não possui uma loja.');
    return store;
  }
}

export const couponsService = new CouponsService();
