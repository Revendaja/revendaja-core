import { describe, expect, it } from 'vitest';
import type { Coupon } from '@/lib/api/types';
import { couponDetails, couponDiscountLabel, couponStatus, endOfDayIso } from './coupons';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 'c1',
    code: 'VERAO10',
    type: 'percent',
    value: 10,
    minOrder: null,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('couponDiscountLabel', () => {
  it('percentual e valor fixo', () => {
    expect(couponDiscountLabel({ type: 'percent', value: 10 })).toBe('10% de desconto');
    expect(couponDiscountLabel({ type: 'fixed', value: 20 })).toMatch(/R\$\s?20,00 de desconto/);
  });
});

describe('couponStatus', () => {
  it('ativo por padrão', () => {
    expect(couponStatus(coupon(), NOW)).toEqual({ key: 'active', label: 'Ativo' });
  });

  it('desligado, vencido e esgotado', () => {
    expect(couponStatus(coupon({ isActive: false }), NOW).key).toBe('off');
    expect(couponStatus(coupon({ expiresAt: '2026-11-15T00:00:00.000Z' }), NOW).key).toBe('expired');
    expect(couponStatus(coupon({ maxUses: 3, usedCount: 3 }), NOW).key).toBe('exhausted');
  });

  it('desligado vale mais que vencido/esgotado', () => {
    expect(couponStatus(coupon({ isActive: false, maxUses: 1, usedCount: 1 }), NOW).key).toBe('off');
  });

  it('ainda no prazo e com usos sobrando está ativo', () => {
    expect(couponStatus(coupon({ expiresAt: '2026-12-01T00:00:00.000Z', maxUses: 3, usedCount: 2 }), NOW).key).toBe('active');
  });
});

describe('couponDetails', () => {
  it('sem mínimo, sem limite e sem validade: só os usos', () => {
    expect(couponDetails(coupon({ usedCount: 1 }))).toEqual(['1 uso']);
    expect(couponDetails(coupon({ usedCount: 4 }))).toEqual(['4 usos']);
  });

  it('com mínimo, limite e validade', () => {
    const details = couponDetails(coupon({ minOrder: 100, maxUses: 10, usedCount: 3, expiresAt: '2026-12-31T12:00:00.000Z' }));

    expect(details[0]).toMatch(/Pedido mínimo R\$\s?100,00/);
    expect(details[1]).toBe('3 de 10 usos');
    expect(details[2]).toMatch(/^Vale até \d{2}\/\d{2}\/2026$/);
  });
});

describe('endOfDayIso', () => {
  it('vira o fim do dia escolhido (no fuso local)', () => {
    const date = new Date(endOfDayIso('2026-11-30') as string);

    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 10, 30, 23, 59]);
  });

  it('data vazia ou inválida: null', () => {
    expect(endOfDayIso('')).toBeNull();
    expect(endOfDayIso('abc')).toBeNull();
  });
});
