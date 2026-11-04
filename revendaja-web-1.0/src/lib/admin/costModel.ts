// Simulador de custos do Revendaja (painel de administração). É um cálculo puro: recebe os preços e
// premissas que a administradora digita e devolve custo, contribuição e resultado por plano. As
// mesmas contas do relatório docs/RELATORIO_CUSTOS_PLANOS_E_IA.md (conferidas em costModel.test.ts).

export type PlanId = 'free' | 'starter' | 'premium' | 'business';
export const PLAN_IDS: PlanId[] = ['free', 'starter', 'premium', 'business'];
export const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Gratuito',
  starter: 'Inicial',
  premium: 'Pro',
  business: 'Empresarial',
};
export const PAID_PLAN_IDS: PlanId[] = ['starter', 'premium', 'business'];

// Por onde o assinante paga a mensalidade. Cada canal fica com uma parte do que a loja paga.
export type ChannelId = 'stripe' | 'apple' | 'google';
export const CHANNEL_IDS: ChannelId[] = ['stripe', 'apple', 'google'];
export const CHANNEL_LABELS: Record<ChannelId, string> = {
  stripe: 'Stripe (cartão, no site)',
  apple: 'Apple (App Store)',
  google: 'Google Play',
};

export interface ChannelInputs {
  // Parte dos assinantes pagantes que paga por este canal (0 a 1; o modelo ajusta se não somar 1).
  share: number;
  // Comissão do canal, em % do valor da mensalidade.
  pct: number;
  // Valor fixo cobrado por cada pagamento, em R$.
  fixedBrl: number;
}

export interface PlanInputs {
  // Preço da mensalidade em R$.
  price: number;
  // Quantas lojas estão (ou estariam) nesse plano.
  subscribers: number;
  // Mensagens do assistente por mês incluídas no plano.
  aiCap: number;
  // Quanto da cota a loja típica usa (0 a 1).
  aiUtilization: number;
  // Visitas à vitrine por mês de uma loja típica.
  visits: number;
}

export interface MessageProfile {
  // Tokens de entrada e saída somados em TODAS as chamadas ao modelo daquela mensagem.
  in: number;
  out: number;
}

export interface AiInputs {
  // US$ por 1 milhão de tokens.
  priceIn: number;
  priceCached: number;
  priceOut: number;
  // Parte da entrada que o cache da OpenAI cobre (0 a 1).
  cachedShare: number;
  simple: MessageProfile;
  query: MessageProfile;
  action: MessageProfile;
  // Pesos do mix de mensagens (não precisam somar 100).
  mixSimple: number;
  mixQuery: number;
  mixAction: number;
  // Média real medida (tokens por mensagem). Quando preenchida, substitui o mix.
  realAverage: MessageProfile | null;
  // Parte das mensagens enviadas por voz e duração média, em segundos.
  voiceShare: number;
  voiceSeconds: number;
  // US$ por minuto de áudio.
  transcribePerMin: number;
}

export interface InfraInputs {
  flyMachines: number;
  flyUsdPerMachine: number;
  neonUsd: number;
  redisUsd: number;
  appleUsdPerYear: number;
  // Domínio e extras, em R$ por mês.
  otherBrl: number;
  // US$ por GB de saída de imagens depois da franquia gratuita.
  imagesEgressUsdPerGb: number;
  // Parte das imagens da vitrine servida do nosso S3 (o resto vem do catálogo).
  imagesShareFromS3: number;
  mbPerVisit: number;
}

export interface CostInputs {
  fx: number;
  plans: Record<PlanId, PlanInputs>;
  ai: AiInputs;
  infra: InfraInputs;
  channels: Record<ChannelId, ChannelInputs>;
  // MEI: o imposto é um valor fixo por mês (DAS), não um percentual, e há teto anual de faturamento.
  mei: { monthlyBrl: number; annualLimitBrl: number };
  // Imposto sobre a mensalidade, em % (ex.: 6 para 6%).
  taxPct: number;
  // Quanto você quer tirar por mês além de cobrir os custos (R$).
  targetProfitBrl: number;
}

export const DEFAULT_INPUTS: CostInputs = {
  fx: 5.4,
  plans: {
    free: { price: 0, subscribers: 50, aiCap: 15, aiUtilization: 0.4, visits: 100 },
    starter: { price: 29.99, subscribers: 20, aiCap: 150, aiUtilization: 0.4, visits: 500 },
    premium: { price: 49.99, subscribers: 8, aiCap: 500, aiUtilization: 0.4, visits: 3000 },
    business: { price: 129.99, subscribers: 2, aiCap: 1500, aiUtilization: 0.4, visits: 10000 },
  },
  ai: {
    priceIn: 0.1,
    priceCached: 0.01,
    priceOut: 0.5,
    cachedShare: 0,
    simple: { in: 5700, out: 150 },
    query: { in: 11900, out: 260 },
    action: { in: 18500, out: 420 },
    mixSimple: 40,
    mixQuery: 40,
    mixAction: 20,
    realAverage: null,
    voiceShare: 0.3,
    voiceSeconds: 20,
    transcribePerMin: 0.0045,
  },
  infra: {
    flyMachines: 1,
    flyUsdPerMachine: 6.7,
    neonUsd: 0,
    redisUsd: 0,
    appleUsdPerYear: 99,
    otherBrl: 5,
    imagesEgressUsdPerGb: 0.09,
    imagesShareFromS3: 0.3,
    mbPerVisit: 1,
  },
  channels: {
    // Estimativa da divisão entre os canais: o sistema só conhece a Stripe hoje.
    stripe: { share: 0.3, pct: 3.99, fixedBrl: 0.39 },
    apple: { share: 0.2, pct: 15, fixedBrl: 0 },
    google: { share: 0.5, pct: 15, fixedBrl: 0 },
  },
  // DAS 2026: R$ 81,05 (INSS, 5% do salário mínimo) + R$ 5 (ISS, prestação de serviços).
  mei: { monthlyBrl: 86.05, annualLimitBrl: 81_000 },
  taxPct: 0,
  targetProfitBrl: 0,
};

// Pacotes prontos para comparar.
export const AI_MODEL_PRESETS = {
  luna: { label: 'gpt-6-luna (atual)', priceIn: 0.1, priceCached: 0.01, priceOut: 0.5 },
  sol: { label: 'gpt-6-sol (maior)', priceIn: 2, priceCached: 0.2, priceOut: 10 },
} as const;

export const INFRA_PRESETS = {
  lean: { label: 'Enxuto (1 máquina, bancos gratuitos)', flyMachines: 1, neonUsd: 0, redisUsd: 0 },
  stable: { label: 'Estável (2 máquinas, Neon e Redis pagos)', flyMachines: 2, neonUsd: 15, redisUsd: 10 },
} as const;

// ---------------------------------------------------------------------------------------------

export function messageCostUsd(profile: MessageProfile, ai: AiInputs): number {
  const inputUsd =
    (profile.in / 1e6) * ((1 - ai.cachedShare) * ai.priceIn + ai.cachedShare * ai.priceCached);
  return inputUsd + (profile.out / 1e6) * ai.priceOut;
}

// Custo de uma mensagem "média": a média real medida, ou o mix de perfis.
export function averageMessageCostUsd(ai: AiInputs): number {
  if (ai.realAverage) return messageCostUsd(ai.realAverage, ai);
  const weights = ai.mixSimple + ai.mixQuery + ai.mixAction;
  if (weights <= 0) return 0;
  return (
    (messageCostUsd(ai.simple, ai) * ai.mixSimple +
      messageCostUsd(ai.query, ai) * ai.mixQuery +
      messageCostUsd(ai.action, ai) * ai.mixAction) /
    weights
  );
}

export function voiceCostUsd(seconds: number, ai: AiInputs): number {
  return (ai.transcribePerMin * seconds) / 60;
}

export interface PlanResult {
  id: PlanId;
  price: number;
  subscribers: number;
  aiChat: number;
  aiVoice: number;
  other: number;
  // Comissão média por cliente deste plano, já considerando a divisão entre os canais.
  gateway: number;
  // O mesmo valor aberto por canal.
  feesByChannel: Record<ChannelId, number>;
  tax: number;
  total: number;
  contribution: number;
  marginPct: number | null;
  // Pior caso: usa 100% da cota, toda mensagem pesada, toda por voz de 30 s.
  worstTotal: number;
  worstContribution: number;
  worstMarginPct: number | null;
}

export interface ModelResult {
  perMessageBrl: number;
  perVoiceMinuteBrl: number;
  plans: Record<PlanId, PlanResult>;
  fixedBrl: number;
  fixedBreakdown: { label: string; value: number }[];
  mrr: number;
  payingStores: number;
  freeStores: number;
  variableCost: number;
  contribution: number;
  profit: number;
  netMarginPct: number | null;
  aiTotal: number;
  // Quanto cada canal fica por mês (comissões).
  channelFees: Record<ChannelId, number>;
  // Receita de 12 meses e quanto ela já usa do teto anual do MEI.
  annualRevenue: number;
  meiLimitUsedPct: number;
  // O que cada novo assinante pagante deixa de lucro, já descontando o custo das lojas gratuitas.
  netPerPayer: number;
  // Assinantes pagantes para cobrir os custos fixos (e o objetivo de ganho), mantendo a proporção
  // atual entre os planos. null = não há como calcular (contribuição ≤ 0).
  breakEvenInfra: number | null;
  breakEvenTarget: number | null;
}


export function computeModel(inputs: CostInputs): ModelResult {
  const { fx, ai, infra, channels } = inputs;
  const brl = (usd: number) => usd * fx;

  // Divisão entre os canais, normalizada para somar 100% (se tudo for zero, tudo é Stripe).
  const rawShares = CHANNEL_IDS.map((channel) => Math.max(0, channels[channel].share));
  const shareTotal = rawShares.reduce((sum, value) => sum + value, 0);
  const shareOf = Object.fromEntries(
    CHANNEL_IDS.map((channel, index) => [channel, shareTotal > 0 ? rawShares[index] / shareTotal : channel === 'stripe' ? 1 : 0]),
  ) as Record<ChannelId, number>;

  const avgMessage = brl(averageMessageCostUsd(ai));
  const heavyMessage = brl(messageCostUsd(ai.action, ai));

  const plans = {} as Record<PlanId, PlanResult>;
  for (const id of PLAN_IDS) {
    const plan = inputs.plans[id];
    const messages = plan.aiCap * plan.aiUtilization;
    const aiChat = messages * avgMessage;
    const aiVoice = messages * ai.voiceShare * brl(voiceCostUsd(ai.voiceSeconds, ai));
    const gb = ((plan.visits * infra.mbPerVisit) / 1024) * infra.imagesShareFromS3;
    const other = brl(gb * infra.imagesEgressUsdPerGb) + 0.02;
    const paid = plan.price > 0;
    const feesByChannel = { stripe: 0, apple: 0, google: 0 } as Record<ChannelId, number>;
    if (paid) {
      for (const channel of CHANNEL_IDS) {
        const { pct, fixedBrl } = channels[channel];
        feesByChannel[channel] = shareOf[channel] * ((plan.price * pct) / 100 + fixedBrl);
      }
    }
    const gatewayFee = CHANNEL_IDS.reduce((sum, channel) => sum + feesByChannel[channel], 0);
    const tax = (plan.price * inputs.taxPct) / 100;
    const total = aiChat + aiVoice + other + gatewayFee + tax;

    const worstAi = plan.aiCap * (heavyMessage + brl(voiceCostUsd(30, ai)));
    const worstTotal = worstAi + other + gatewayFee + tax;

    plans[id] = {
      id,
      price: plan.price,
      subscribers: plan.subscribers,
      aiChat,
      aiVoice,
      other,
      gateway: gatewayFee,
      feesByChannel,
      tax,
      total,
      contribution: plan.price - total,
      marginPct: paid ? ((plan.price - total) / plan.price) * 100 : null,
      worstTotal,
      worstContribution: plan.price - worstTotal,
      worstMarginPct: paid ? ((plan.price - worstTotal) / plan.price) * 100 : null,
    };
  }

  const fixedBreakdown = [
    { label: `Servidor (${infra.flyMachines} máquina${infra.flyMachines === 1 ? '' : 's'})`, value: brl(infra.flyMachines * infra.flyUsdPerMachine) },
    { label: 'Banco (Neon)', value: brl(infra.neonUsd) },
    { label: 'Fila (Redis)', value: brl(infra.redisUsd) },
    { label: 'Conta Apple Developer', value: brl(infra.appleUsdPerYear / 12) },
    { label: 'Domínio e extras', value: infra.otherBrl },
    { label: 'Imposto MEI (DAS)', value: inputs.mei.monthlyBrl },
  ];
  const fixedBrl = fixedBreakdown.reduce((sum, item) => sum + item.value, 0);

  let mrr = 0;
  let variableCost = 0;
  let aiTotal = 0;
  let payingStores = 0;
  let freeStores = 0;
  let paidContribution = 0;
  const channelFees = { stripe: 0, apple: 0, google: 0 } as Record<ChannelId, number>;
  for (const id of PLAN_IDS) {
    const plan = plans[id];
    mrr += plan.price * plan.subscribers;
    variableCost += plan.total * plan.subscribers;
    aiTotal += (plan.aiChat + plan.aiVoice) * plan.subscribers;
    for (const channel of CHANNEL_IDS) channelFees[channel] += plan.feesByChannel[channel] * plan.subscribers;
    if (plan.price > 0) {
      payingStores += plan.subscribers;
      paidContribution += plan.contribution * plan.subscribers;
    } else {
      freeStores += plan.subscribers;
    }
  }
  const contribution = mrr - variableCost;
  const profit = contribution - fixedBrl;

  // Contribuição média por pagante já descontando o custo dos gratuitos que "vêm junto".
  let netPerPayer: number | null = null;
  if (payingStores > 0) {
    const freeCost = plans.free.total * freeStores;
    netPerPayer = (paidContribution - freeCost) / payingStores;
  } else {
    // Sem pagantes ainda: proporção sugerida 60/30/10 entre Inicial, Pro e Empresarial.
    netPerPayer =
      plans.starter.contribution * 0.6 + plans.premium.contribution * 0.3 + plans.business.contribution * 0.1;
  }

  return {
    perMessageBrl: avgMessage,
    perVoiceMinuteBrl: brl(ai.transcribePerMin),
    plans,
    fixedBrl,
    fixedBreakdown,
    mrr,
    payingStores,
    freeStores,
    variableCost,
    contribution,
    profit,
    netMarginPct: mrr > 0 ? (profit / mrr) * 100 : null,
    aiTotal,
    channelFees,
    annualRevenue: mrr * 12,
    meiLimitUsedPct: inputs.mei.annualLimitBrl > 0 ? ((mrr * 12) / inputs.mei.annualLimitBrl) * 100 : 0,
    netPerPayer,
    breakEvenInfra: netPerPayer > 0 ? Math.ceil(fixedBrl / netPerPayer) : null,
    breakEvenTarget:
      netPerPayer > 0 ? Math.ceil((fixedBrl + inputs.targetProfitBrl) / netPerPayer) : null,
  };
}
