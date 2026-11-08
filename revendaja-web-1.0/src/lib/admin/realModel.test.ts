import { describe, expect, it } from 'vitest';
import type { AdminOverview } from '@/lib/api/admin';
import { DEFAULT_INPUTS } from './costModel';
import { modelWithRealData } from './realModel';

function overview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  const empty = { messages: 0, transcriptions: 0, inputTokens: 0, outputTokens: 0, storesUsing: 0 };
  return {
    generatedAt: new Date().toISOString(),
    users: { total: 0, verified: 0, new7d: 0, new30d: 0 },
    stores: {
      total: 4,
      online: 4,
      new7d: 0,
      new30d: 0,
      active30d: 0,
      paying: 3,
      byPlan: { free: 1, starter: 2, premium: 1 },
    },
    subscriptions: { byStatus: {}, cancelAtPeriodEnd: 0, renewingIn7d: 0 },
    gmv: {
      last30d: { gross: 0, paidSales: 0, onlineSales: 0, activeStores: 0 },
      previous30d: { gross: 0, paidSales: 0, onlineSales: 0, activeStores: 0 },
    },
    weekly: [],
    devices: { ios: 0, android: 0, unknown: 0 },
    catalog: { products: 0, brands: 0 },
    ai: { period: '2026-11', previousPeriod: '2026-10', current: empty, previous: empty },
    ...overrides,
  };
}

describe('modelWithRealData', () => {
  it('usa as lojas reais por plano e a receita vira a soma das mensalidades', () => {
    const { model } = modelWithRealData(DEFAULT_INPUTS, overview());
    expect(model.mrr).toBeCloseTo(2 * 29.99 + 49.99, 2);
    expect(model.payingStores).toBe(3);
    expect(model.freeStores).toBe(1);
  });

  it('troca a estimativa de IA pelo consumo medido', () => {
    const real = overview({
      ai: {
        period: '2026-11',
        previousPeriod: '2026-10',
        previous: { messages: 0, transcriptions: 0, inputTokens: 0, outputTokens: 0, storesUsing: 0 },
        current: { messages: 10, transcriptions: 4, inputTokens: 1_000_000, outputTokens: 100_000, storesUsing: 2 },
      },
    });
    const { aiReal, variableReal, model } = modelWithRealData(DEFAULT_INPUTS, real);

    // (1 M x US$ 0,10 + 100 mil x US$ 0,50 + 4 transcrições de 20 s) x R$ 5,40.
    const expected = (0.1 + 0.05 + 4 * (20 / 60) * 0.0045) * 5.4;
    expect(aiReal).toBeCloseTo(expected, 4);
    expect(variableReal).toBeCloseTo(model.variableCost - model.aiTotal + aiReal, 6);
  });

  it('o resultado muda quando o preço do Neon muda', () => {
    const base = modelWithRealData(DEFAULT_INPUTS, overview());
    const withNeon = modelWithRealData(
      { ...DEFAULT_INPUTS, infra: { ...DEFAULT_INPUTS.infra, neonUsd: 19 } },
      overview(),
    );
    expect(base.profitReal - withNeon.profitReal).toBeCloseTo(19 * 5.4, 4);
  });
});
