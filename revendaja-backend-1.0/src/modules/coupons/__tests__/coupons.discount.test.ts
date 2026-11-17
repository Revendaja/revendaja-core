import { discountFor, evaluateCoupon, normalizeCouponCode } from '../coupons.discount';
import type { Coupon } from '../coupons.types';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function rules(overrides: Partial<Coupon> = {}) {
  return {
    type: 'percent' as const,
    value: 10,
    minOrder: null,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

describe('normalizeCouponCode', () => {
  it('tira espaços e põe em maiúsculas', () => {
    expect(normalizeCouponCode('  ver ao10 ')).toBe('VERAO10');
  });
});

describe('discountFor', () => {
  it('percentual arredonda para o centavo', () => {
    // 10% de R$ 99,99 = 9,999 -> R$ 10,00
    expect(discountFor({ type: 'percent', value: 10 }, 9999)).toBe(1000);
    // 15% de R$ 33,33 = 4,9995 -> R$ 5,00
    expect(discountFor({ type: 'percent', value: 15 }, 3333)).toBe(500);
  });

  it('valor fixo em reais vira centavos', () => {
    expect(discountFor({ type: 'fixed', value: 12.5 }, 10000)).toBe(1250);
  });

  it('valor fixo nunca passa do total do pedido', () => {
    expect(discountFor({ type: 'fixed', value: 50 }, 3000)).toBe(3000);
  });

  it('100% zera o pedido, sem ficar negativo', () => {
    expect(discountFor({ type: 'percent', value: 100 }, 4590)).toBe(4590);
  });
});

describe('evaluateCoupon', () => {
  it('cupom que não existe é inválido (mensagem genérica)', () => {
    const result = evaluateCoupon(null, 10000, NOW);

    expect(result).toEqual({
      ok: false,
      reason: 'not_found',
      message: 'Cupom inválido ou expirado.',
    });
  });

  it('cupom desligado ou vencido tem a mesma mensagem genérica', () => {
    const off = evaluateCoupon(rules({ isActive: false }), 10000, NOW);
    const expired = evaluateCoupon(
      rules({ expiresAt: new Date('2026-11-15T00:00:00.000Z') }),
      10000,
      NOW,
    );

    expect(off).toMatchObject({
      ok: false,
      reason: 'inactive',
      message: 'Cupom inválido ou expirado.',
    });
    expect(expired).toMatchObject({
      ok: false,
      reason: 'expired',
      message: 'Cupom inválido ou expirado.',
    });
  });

  it('vale até o instante da validade', () => {
    const result = evaluateCoupon(rules({ expiresAt: new Date(NOW.getTime() + 1000) }), 10000, NOW);

    expect(result).toEqual({ ok: true, discountCents: 1000 });
  });

  it('limite de usos esgotado', () => {
    const result = evaluateCoupon(rules({ maxUses: 5, usedCount: 5 }), 10000, NOW);

    expect(result).toMatchObject({ ok: false, reason: 'exhausted' });
  });

  it('ainda com usos sobrando, vale', () => {
    expect(evaluateCoupon(rules({ maxUses: 5, usedCount: 4 }), 10000, NOW)).toEqual({
      ok: true,
      discountCents: 1000,
    });
  });

  it('pedido abaixo do mínimo: avisa o valor', () => {
    const result = evaluateCoupon(rules({ minOrder: 100 }), 9999, NOW);

    expect(result).toMatchObject({ ok: false, reason: 'min_order' });
    expect((result as { message: string }).message).toContain('100,00');
  });

  it('pedido exatamente no mínimo vale', () => {
    expect(evaluateCoupon(rules({ minOrder: 100 }), 10000, NOW)).toEqual({
      ok: true,
      discountCents: 1000,
    });
  });

  it('pedido vazio não gera desconto', () => {
    expect(evaluateCoupon(rules(), 0, NOW)).toMatchObject({ ok: false });
  });
});
