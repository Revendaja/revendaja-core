import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_PRESETS,
  CHANNEL_IDS,
  DEFAULT_INPUTS,
  INFRA_PRESETS,
  averageMessageCostUsd,
  computeModel,
  type CostInputs,
} from './costModel';

// Os números do relatório docs/RELATORIO_CUSTOS_PLANOS_E_IA.md foram feitos com TODOS os assinantes
// pagando pela Stripe e sem o imposto do MEI. `LEGACY` reproduz esse cenário: se estes testes
// quebrarem, o simulador e o relatório deixaram de concordar.
const LEGACY: CostInputs = {
  ...DEFAULT_INPUTS,
  channels: {
    stripe: { share: 1, pct: 3.99, fixedBrl: 0.39 },
    apple: { share: 0, pct: 15, fixedBrl: 0 },
    google: { share: 0, pct: 15, fixedBrl: 0 },
  },
  mei: { monthlyBrl: 0, annualLimitBrl: 81_000 },
};

function inputs(overrides: Partial<CostInputs> = {}): CostInputs {
  return { ...DEFAULT_INPUTS, ...overrides };
}

describe('custo da IA', () => {
  it('uma mensagem média custa cerca de R$ 0,0065 com o gpt-6-luna', () => {
    expect(computeModel(inputs()).perMessageBrl).toBeCloseTo(0.0065, 4);
  });

  it('com 80% da entrada em cache a mensagem cai para cerca de R$ 0,0023', () => {
    const model = computeModel(inputs({ ai: { ...DEFAULT_INPUTS.ai, cachedShare: 0.8 } }));
    expect(model.perMessageBrl).toBeCloseTo(0.0023, 4);
  });

  it('o gpt-6-sol custa cerca de 20 vezes mais', () => {
    const luna = averageMessageCostUsd(DEFAULT_INPUTS.ai);
    const sol = averageMessageCostUsd({ ...DEFAULT_INPUTS.ai, ...AI_MODEL_PRESETS.sol });
    expect(sol / luna).toBeGreaterThan(19);
    expect(sol / luna).toBeLessThan(21);
  });

  it('a média real medida substitui o mix de perfis', () => {
    const model = computeModel(
      inputs({ ai: { ...DEFAULT_INPUTS.ai, realAverage: { in: 10_000, out: 200 } } }),
    );
    expect(model.perMessageBrl).toBeCloseTo(((10_000 * 0.1 + 200 * 0.5) / 1e6) * 5.4, 6);
  });
});

describe('custo por plano (cenário do relatório: tudo pela Stripe, sem MEI)', () => {
  const { plans } = computeModel(LEGACY);

  it('uso típico bate com o relatório', () => {
    expect(plans.free.total).toBeCloseTo(0.09, 2);
    expect(plans.starter.total).toBeCloseTo(2.21, 2);
    expect(plans.premium.total).toBeCloseTo(4.61, 2);
    expect(plans.business.total).toBeCloseTo(12.36, 2);
  });

  it('margens típicas', () => {
    expect(plans.starter.marginPct).toBeCloseTo(92.6, 1);
    expect(plans.premium.marginPct).toBeCloseTo(90.8, 1);
    expect(plans.business.marginPct).toBeCloseTo(90.5, 1);
    expect(plans.free.marginPct).toBeNull();
  });

  it('pior caso (cota 100%, só ações, tudo por voz)', () => {
    expect(plans.starter.worstTotal).toBeCloseTo(5.17, 2);
    expect(plans.premium.worstTotal).toBeCloseTo(14.47, 2);
    expect(plans.business.worstTotal).toBeCloseTo(41.93, 2);
    expect(plans.business.worstMarginPct).toBeCloseTo(67.7, 1);
  });

  it('a Stripe cobra 3,99% + R$ 0,39 só nos planos pagos', () => {
    expect(plans.free.gateway).toBe(0);
    expect(plans.starter.gateway).toBeCloseTo(29.99 * 0.0399 + 0.39, 4);
  });

  it('imposto sobre a receita (para quem não é MEI) muda a margem', () => {
    const taxed = computeModel({ ...LEGACY, taxPct: 6 }).plans.starter;
    expect(taxed.tax).toBeCloseTo(29.99 * 0.06, 4);
    expect(taxed.contribution).toBeLessThan(plans.starter.contribution);
  });
});

describe('canais de venda: Stripe, Apple e Google Play', () => {
  it('a comissão do plano é a média ponderada pela divisão entre os canais', () => {
    const starter = computeModel(inputs()).plans.starter;
    const stripe = 29.99 * 0.0399 + 0.39;
    const store = 29.99 * 0.15;

    // Divisão padrão: 30% Stripe, 20% Apple, 50% Google.
    expect(starter.feesByChannel.stripe).toBeCloseTo(0.3 * stripe, 4);
    expect(starter.feesByChannel.apple).toBeCloseTo(0.2 * store, 4);
    expect(starter.feesByChannel.google).toBeCloseTo(0.5 * store, 4);
    expect(starter.gateway).toBeCloseTo(0.3 * stripe + 0.7 * store, 4);
  });

  it('vender tudo pelas lojas de aplicativos deixa bem menos que vender pela Stripe', () => {
    const allStripe = computeModel(LEGACY).plans.premium;
    const allApple = computeModel({
      ...LEGACY,
      channels: { ...LEGACY.channels, stripe: { ...LEGACY.channels.stripe, share: 0 }, apple: { ...LEGACY.channels.apple, share: 1 } },
    }).plans.premium;

    expect(allApple.gateway).toBeCloseTo(49.99 * 0.15, 4);
    expect(allStripe.contribution - allApple.contribution).toBeGreaterThan(4);
  });

  it('a divisão é normalizada: 3/2/5 é o mesmo que 30%/20%/50%', () => {
    const scaled = computeModel(
      inputs({
        channels: {
          stripe: { ...DEFAULT_INPUTS.channels.stripe, share: 3 },
          apple: { ...DEFAULT_INPUTS.channels.apple, share: 2 },
          google: { ...DEFAULT_INPUTS.channels.google, share: 5 },
        },
      }),
    );
    expect(scaled.plans.starter.gateway).toBeCloseTo(computeModel(inputs()).plans.starter.gateway, 6);
  });

  it('se a divisão for toda zero, assume Stripe (nunca fica sem comissão)', () => {
    const zero = computeModel(
      inputs({
        channels: {
          stripe: { ...DEFAULT_INPUTS.channels.stripe, share: 0 },
          apple: { ...DEFAULT_INPUTS.channels.apple, share: 0 },
          google: { ...DEFAULT_INPUTS.channels.google, share: 0 },
        },
      }),
    );
    expect(zero.plans.starter.gateway).toBeCloseTo(29.99 * 0.0399 + 0.39, 4);
  });

  it('o total de comissões por canal é o valor por cliente vezes as lojas do plano', () => {
    const model = computeModel(inputs());
    const apple = PLAN_SUBSCRIBERS.reduce((sum, [id, subs]) => sum + model.plans[id].feesByChannel.apple * subs, 0);
    expect(model.channelFees.apple).toBeCloseTo(apple, 6);
    const all = CHANNEL_IDS.reduce((sum, channel) => sum + model.channelFees[channel], 0);
    const perClient = PLAN_SUBSCRIBERS.reduce((sum, [id, subs]) => sum + model.plans[id].gateway * subs, 0);
    expect(all).toBeCloseTo(perClient, 6);
  });
});

const PLAN_SUBSCRIBERS = [
  ['free', DEFAULT_INPUTS.plans.free.subscribers],
  ['starter', DEFAULT_INPUTS.plans.starter.subscribers],
  ['premium', DEFAULT_INPUTS.plans.premium.subscribers],
  ['business', DEFAULT_INPUTS.plans.business.subscribers],
] as const;

describe('MEI', () => {
  it('o imposto é um valor fixo por mês, entra nos custos fixos e não depende da receita', () => {
    const model = computeModel(inputs());
    const mei = model.fixedBreakdown.find((item) => item.label === 'Imposto MEI (DAS)');
    expect(mei?.value).toBeCloseTo(86.05, 2);
    // Dobrar as lojas não muda o DAS.
    const doubled = computeModel(
      inputs({
        plans: {
          ...DEFAULT_INPUTS.plans,
          starter: { ...DEFAULT_INPUTS.plans.starter, subscribers: 200 },
        },
      }),
    );
    expect(doubled.fixedBreakdown.find((item) => item.label === 'Imposto MEI (DAS)')?.value).toBeCloseTo(86.05, 2);
  });

  it('acompanha quanto da receita anual já usa do teto de R$ 81 mil', () => {
    const model = computeModel(inputs());
    expect(model.annualRevenue).toBeCloseTo(model.mrr * 12, 6);
    expect(model.meiLimitUsedPct).toBeCloseTo(((model.mrr * 12) / 81_000) * 100, 6);
  });

  it('passar de R$ 6.750 por mês estoura o teto anual', () => {
    const model = computeModel(
      inputs({
        plans: { ...DEFAULT_INPUTS.plans, premium: { ...DEFAULT_INPUTS.plans.premium, subscribers: 150 } },
      }),
    );
    expect(model.mrr).toBeGreaterThan(6_750);
    expect(model.meiLimitUsedPct).toBeGreaterThan(100);
  });
});

describe('empresa', () => {
  it('custos fixos do cenário do relatório: ~R$ 86 enxuto e ~R$ 257 estável', () => {
    expect(computeModel(LEGACY).fixedBrl).toBeCloseTo(86, 0);
    const stable = computeModel({ ...LEGACY, infra: { ...LEGACY.infra, ...INFRA_PRESETS.stable } });
    expect(stable.fixedBrl).toBeCloseTo(257, 0);
  });

  it('com o MEI, o custo fixo enxuto sobe o valor do DAS', () => {
    expect(computeModel(inputs()).fixedBrl).toBeCloseTo(computeModel(LEGACY).fixedBrl + 86.05, 2);
  });

  it('receita recorrente e resultado do mês', () => {
    const model = computeModel(inputs());
    expect(model.mrr).toBeCloseTo(29.99 * 20 + 49.99 * 8 + 129.99 * 2, 2);
    expect(model.payingStores).toBe(30);
    expect(model.freeStores).toBe(50);
    expect(model.profit).toBeCloseTo(model.mrr - model.variableCost - model.fixedBrl, 6);
  });

  it('ponto de equilíbrio do relatório: ~7 assinantes para a infraestrutura e ~78 com um salário de R$ 3.000', () => {
    const base: CostInputs = {
      ...LEGACY,
      plans: {
        ...DEFAULT_INPUTS.plans,
        free: { ...DEFAULT_INPUTS.plans.free, subscribers: 0 },
        starter: { ...DEFAULT_INPUTS.plans.starter, subscribers: 60 },
        premium: { ...DEFAULT_INPUTS.plans.premium, subscribers: 30 },
        business: { ...DEFAULT_INPUTS.plans.business, subscribers: 10 },
      },
      infra: { ...LEGACY.infra, ...INFRA_PRESETS.stable },
      targetProfitBrl: 3000,
    };
    const model = computeModel(base);
    expect(model.breakEvenInfra).toBe(7);
    expect(model.breakEvenTarget).toBeGreaterThanOrEqual(77);
    expect(model.breakEvenTarget).toBeLessThanOrEqual(80);
  });

  it('com comissão de lojas e MEI, o equilíbrio exige mais assinantes', () => {
    const withStores = computeModel(inputs());
    const stripeOnly = computeModel(LEGACY);
    expect(withStores.breakEvenInfra ?? 0).toBeGreaterThan(stripeOnly.breakEvenInfra ?? 0);
  });

  it('sem contribuição positiva não existe ponto de equilíbrio', () => {
    const model = computeModel({
      ...LEGACY,
      channels: { ...LEGACY.channels, stripe: { share: 1, pct: 99, fixedBrl: 50 } },
      plans: {
        ...DEFAULT_INPUTS.plans,
        starter: { ...DEFAULT_INPUTS.plans.starter, subscribers: 0 },
        premium: { ...DEFAULT_INPUTS.plans.premium, subscribers: 0 },
        business: { ...DEFAULT_INPUTS.plans.business, subscribers: 0 },
      },
    });
    expect(model.breakEvenInfra).toBeNull();
  });
});
