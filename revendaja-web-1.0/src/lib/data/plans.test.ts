import { describe, expect, it } from 'vitest';
import { PLANS, findPlan, planRank, productsOverLimit } from './plans';

describe('findPlan', () => {
  it('acha o plano pelo id', () => {
    expect(findPlan('premium').name).toBe('Pro');
  });

  it('cai no Gratuito quando o id é desconhecido ou ausente', () => {
    expect(findPlan(undefined).id).toBe('free');
  });
});

describe('planRank', () => {
  it('ordena do mais barato ao mais caro', () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(['free', 'starter', 'premium', 'business']);
    expect(planRank('free')).toBeLessThan(planRank('starter'));
    expect(planRank('starter')).toBeLessThan(planRank('premium'));
    expect(planRank('premium')).toBeLessThan(planRank('business'));
  });
});

describe('productsOverLimit', () => {
  it('conta só o que passa do limite do plano', () => {
    expect(productsOverLimit(320, 'starter')).toBe(120);
    expect(productsOverLimit(45, 'free')).toBe(15);
  });

  it('é zero quando está dentro do limite ou exatamente no limite', () => {
    expect(productsOverLimit(10, 'free')).toBe(0);
    expect(productsOverLimit(30, 'free')).toBe(0);
  });

  it('é zero em plano sem limite de produtos', () => {
    expect(productsOverLimit(5000, 'premium')).toBe(0);
    expect(productsOverLimit(5000, 'business')).toBe(0);
  });
});

describe('catálogo de planos', () => {
  it('só os planos pagos têm cobrança mensal', () => {
    for (const plan of PLANS) {
      expect(Boolean(plan.billingLabel)).toBe(plan.id !== 'free');
    }
  });

  it('tem exatamente um plano em destaque', () => {
    expect(PLANS.filter((plan) => plan.highlight)).toHaveLength(1);
  });
});
