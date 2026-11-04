import { describe, expect, it } from 'vitest';
import type { AdminAi, AdminOverview } from '@/lib/api/admin';
import { DEFAULT_INPUTS, computeModel } from './costModel';
import { DEFAULT_EDITABLE, inputsFromEditable, mergeEditable } from './editable';
import { applyRealData } from './realModel';

const empty = { messages: 0, transcriptions: 0, inputTokens: 0, outputTokens: 0, storesUsing: 0 };

function overview(byPlan = { free: 5, starter: 4, premium: 2, business: 1 }): AdminOverview {
  return {
    generatedAt: new Date().toISOString(),
    users: { total: 0, verified: 0, new7d: 0, new30d: 0 },
    stores: { total: 12, online: 12, new7d: 0, new30d: 0, active30d: 0, paying: 7, byPlan },
    subscriptions: { byStatus: {}, cancelAtPeriodEnd: 0, renewingIn7d: 0 },
    gmv: {
      last30d: { gross: 0, paidSales: 0, onlineSales: 0, activeStores: 0 },
      previous30d: { gross: 0, paidSales: 0, onlineSales: 0, activeStores: 0 },
    },
    weekly: [],
    devices: { ios: 0, android: 0, unknown: 0 },
    catalog: { products: 0, brands: 0 },
    ai: { period: '2026-11', previousPeriod: '2026-10', current: empty, previous: empty },
  };
}

function ai(overrides: Partial<AdminAi> = {}): AdminAi {
  return {
    period: '2026-11',
    totals: { messages: 100, transcriptions: 30, inputTokens: 1_000_000, outputTokens: 20_000, storesUsing: 3 },
    history: [],
    byPlan: [
      { plan: 'starter', stores: 3, messages: 60, transcriptions: 20, inputTokens: 600_000, outputTokens: 12_000 },
      { plan: 'premium', stores: 1, messages: 40, transcriptions: 10, inputTokens: 400_000, outputTokens: 8_000 },
    ],
    byStore: [],
    model: { name: 'gpt-6-luna', reasoningEffort: 'none' },
    ...overrides,
  };
}

describe('valores editáveis', () => {
  it('os padrões reproduzem as premissas fixas do modelo', () => {
    const inputs = inputsFromEditable(DEFAULT_EDITABLE);
    expect(inputs.plans.starter.price).toBe(DEFAULT_INPUTS.plans.starter.price);
    expect(computeModel(inputs).fixedBrl).toBeCloseTo(computeModel(DEFAULT_INPUTS).fixedBrl, 6);
  });

  it('o preço dos planos e o custo dos serviços entram no modelo', () => {
    const inputs = inputsFromEditable({
      prices: { starter: 39.9, premium: 59.9, business: 149.9 },
      servicesUsd: { server: 13.4, database: 19, queue: 10 },
      channelShares: { stripe: 0.5, apple: 0.25, google: 0.25 },
    });
    expect(inputs.plans.premium.price).toBe(59.9);
    // (13,40 + 19 + 10) x 5,40 + conta Apple (99/12 x 5,40) + R$ 5 de extras + DAS do MEI.
    expect(computeModel(inputs).fixedBrl).toBeCloseTo((13.4 + 19 + 10) * 5.4 + (99 / 12) * 5.4 + 5 + 86.05, 4);
    expect(inputs.channels.apple.share).toBe(0.25);
  });

  it('o resto não muda: continua com os valores fixos', () => {
    const inputs = inputsFromEditable({ ...DEFAULT_EDITABLE, prices: { starter: 99, premium: 99, business: 99 } });
    expect(inputs.fx).toBe(DEFAULT_INPUTS.fx);
    expect(inputs.ai).toEqual(DEFAULT_INPUTS.ai);
    // As comissões dos canais e o imposto do MEI são fixos: só a divisão entre os canais é editável.
    expect(inputs.channels.stripe.pct).toBe(DEFAULT_INPUTS.channels.stripe.pct);
    expect(inputs.channels.apple.pct).toBe(15);
    expect(inputs.mei).toEqual(DEFAULT_INPUTS.mei);
    expect(inputs.plans.starter.aiCap).toBe(DEFAULT_INPUTS.plans.starter.aiCap);
  });

  it('ignora lixo salvo no navegador (negativos, textos, campos que não existem mais)', () => {
    const merged = mergeEditable({
      prices: { starter: -5, premium: 'caro', business: 99.9, free: 10 },
      servicesUsd: { server: 8, database: Number.NaN },
      channelShares: { stripe: 0.4, apple: 7, google: 'x' },
      fx: 99,
    });
    expect(merged.prices.starter).toBe(DEFAULT_EDITABLE.prices.starter);
    expect(merged.prices.premium).toBe(DEFAULT_EDITABLE.prices.premium);
    expect(merged.prices.business).toBe(99.9);
    expect(merged.servicesUsd.server).toBe(8);
    expect(merged.servicesUsd.database).toBe(DEFAULT_EDITABLE.servicesUsd.database);
    expect(merged.channelShares.stripe).toBe(0.4);
    expect(merged.channelShares.apple).toBe(DEFAULT_EDITABLE.channelShares.apple);
    expect(merged.channelShares.google).toBe(DEFAULT_EDITABLE.channelShares.google);
    expect(mergeEditable(null)).toEqual(DEFAULT_EDITABLE);
  });
});

describe('applyRealData', () => {
  const base = inputsFromEditable(DEFAULT_EDITABLE);

  it('usa as lojas reais de cada plano', () => {
    const { inputs } = applyRealData(base, overview());
    expect(inputs.plans.starter.subscribers).toBe(4);
    expect(inputs.plans.business.subscribers).toBe(1);
    expect(inputs.plans.free.subscribers).toBe(5);
  });

  it('mede quanto cada plano usa da cota e a média de tokens e de voz', () => {
    const { inputs, aiSource } = applyRealData(base, overview(), ai());

    expect(aiSource).toBe('medido');
    // Inicial: 60 mensagens em 4 lojas = 15 por loja, de uma cota de 150.
    expect(inputs.plans.starter.aiUtilization).toBeCloseTo(15 / 150, 6);
    // Pro: 40 mensagens em 2 lojas = 20 por loja, de uma cota de 500.
    expect(inputs.plans.premium.aiUtilization).toBeCloseTo(20 / 500, 6);
    // Plano com lojas e nenhuma mensagem: uso real é zero.
    expect(inputs.plans.business.aiUtilization).toBe(0);
    expect(inputs.ai.realAverage).toEqual({ in: 10_000, out: 200 });
    expect(inputs.ai.voiceShare).toBeCloseTo(0.3, 6);
  });

  it('sem nenhuma mensagem no mês mantém as estimativas padrão', () => {
    const { inputs, aiSource } = applyRealData(
      base,
      overview(),
      ai({ totals: { ...empty }, byPlan: [] }),
    );
    expect(aiSource).toBe('estimado');
    expect(inputs.ai.realAverage).toBeNull();
    expect(inputs.plans.starter.aiUtilization).toBe(DEFAULT_INPUTS.plans.starter.aiUtilization);
  });

  it('o uso nunca passa de 100% da cota', () => {
    const { inputs } = applyRealData(
      base,
      overview(),
      ai({
        byPlan: [{ plan: 'starter', stores: 4, messages: 9_999, transcriptions: 0, inputTokens: 1, outputTokens: 1 }],
      }),
    );
    expect(inputs.plans.starter.aiUtilization).toBe(1);
  });
});
