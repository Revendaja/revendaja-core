import { CHANNEL_IDS, DEFAULT_INPUTS, type ChannelId, type CostInputs, type PlanId } from './costModel';

// O que a administradora pode mudar no painel: só o que o sistema não consegue saber sozinho — a
// mensalidade que ela cobra em cada plano e o que ela paga pelos serviços que escolheu contratar.
// Todo o resto (lojas por plano, consumo de IA, preços da OpenAI, limites dos planos, taxas) vem do
// sistema ou é fixo, e por isso não tem campo para editar.

export type EditablePlanId = Exclude<PlanId, 'free'>;
export const EDITABLE_PLAN_IDS: EditablePlanId[] = ['starter', 'premium', 'business'];

export interface EditableCosts {
  // Mensalidade de cada plano pago, em R$.
  prices: Record<EditablePlanId, number>;
  // Quanto se paga por mês pelos serviços, em US$ (os fornecedores cobram em dólar).
  servicesUsd: { server: number; database: number; queue: number };
  // Por onde os assinantes pagam (0 a 1 cada). O sistema só conhece a Stripe, então é uma estimativa sua.
  channelShares: Record<ChannelId, number>;
}

export const DEFAULT_EDITABLE: EditableCosts = {
  prices: {
    starter: DEFAULT_INPUTS.plans.starter.price,
    premium: DEFAULT_INPUTS.plans.premium.price,
    business: DEFAULT_INPUTS.plans.business.price,
  },
  servicesUsd: {
    server: DEFAULT_INPUTS.infra.flyMachines * DEFAULT_INPUTS.infra.flyUsdPerMachine,
    database: DEFAULT_INPUTS.infra.neonUsd,
    queue: DEFAULT_INPUTS.infra.redisUsd,
  },
  channelShares: {
    stripe: DEFAULT_INPUTS.channels.stripe.share,
    apple: DEFAULT_INPUTS.channels.apple.share,
    google: DEFAULT_INPUTS.channels.google.share,
  },
};

const isMoney = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function mergeEditable(saved: unknown): EditableCosts {
  if (!saved || typeof saved !== 'object') return DEFAULT_EDITABLE;
  const s = saved as { prices?: Record<string, unknown>; servicesUsd?: Record<string, unknown> };
  const prices = { ...DEFAULT_EDITABLE.prices };
  for (const id of EDITABLE_PLAN_IDS) if (isMoney(s.prices?.[id])) prices[id] = s.prices[id] as number;
  const servicesUsd = { ...DEFAULT_EDITABLE.servicesUsd };
  for (const key of ['server', 'database', 'queue'] as const) {
    if (isMoney(s.servicesUsd?.[key])) servicesUsd[key] = s.servicesUsd[key] as number;
  }
  const channelShares = { ...DEFAULT_EDITABLE.channelShares };
  for (const id of CHANNEL_IDS) {
    const value = (saved as { channelShares?: Record<string, unknown> }).channelShares?.[id];
    if (isMoney(value) && value <= 1) channelShares[id] = value;
  }
  return { prices, servicesUsd, channelShares };
}

// Premissas completas do modelo: os padrões fixos mais o que a administradora editou.
export function inputsFromEditable(editable: EditableCosts): CostInputs {
  const plans = { ...DEFAULT_INPUTS.plans };
  for (const id of EDITABLE_PLAN_IDS) plans[id] = { ...plans[id], price: editable.prices[id] };
  return {
    ...DEFAULT_INPUTS,
    plans,
    channels: {
      stripe: { ...DEFAULT_INPUTS.channels.stripe, share: editable.channelShares.stripe },
      apple: { ...DEFAULT_INPUTS.channels.apple, share: editable.channelShares.apple },
      google: { ...DEFAULT_INPUTS.channels.google, share: editable.channelShares.google },
    },
    infra: {
      ...DEFAULT_INPUTS.infra,
      // O custo do servidor é informado já somando todas as máquinas.
      flyMachines: 1,
      flyUsdPerMachine: editable.servicesUsd.server,
      neonUsd: editable.servicesUsd.database,
      redisUsd: editable.servicesUsd.queue,
    },
  };
}
