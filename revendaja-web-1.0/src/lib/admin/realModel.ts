import type { AdminAi, AdminOverview } from '@/lib/api/admin';
import { PLAN_IDS, computeModel, type CostInputs, type ModelResult } from './costModel';

export interface RealData {
  inputs: CostInputs;
  // De onde veio o uso de IA: medido no sistema neste mês ou, sem mensagens ainda, o padrão.
  aiSource: 'medido' | 'estimado';
}

// Troca as premissas "de projeção" pelo que o sistema mede: lojas de cada plano, quanto cada plano
// realmente usa da cota de IA e a média real de tokens por mensagem. Sem nenhuma mensagem no mês
// ainda, mantém as estimativas padrão (não há o que medir).
export function applyRealData(base: CostInputs, overview: AdminOverview, ai?: AdminAi): RealData {
  const plans = { ...base.plans };
  for (const id of PLAN_IDS) {
    plans[id] = { ...plans[id], subscribers: overview.stores.byPlan[id] ?? 0 };
  }

  const totals = ai?.totals ?? overview.ai.current;
  const measured = totals.messages > 0;
  let aiInputs = base.ai;

  if (measured) {
    aiInputs = {
      ...base.ai,
      realAverage: {
        in: Math.round(totals.inputTokens / totals.messages),
        out: Math.round(totals.outputTokens / totals.messages),
      },
      // Voz: parte real das mensagens enviadas por voz.
      voiceShare: Math.min(1, totals.transcriptions / totals.messages),
    };
    if (ai) {
      for (const row of ai.byPlan ?? []) {
        const stores = plans[row.plan]?.subscribers ?? 0;
        if (stores > 0 && plans[row.plan].aiCap > 0) {
          const perStore = row.messages / stores;
          plans[row.plan] = { ...plans[row.plan], aiUtilization: Math.min(1, perStore / plans[row.plan].aiCap) };
        }
      }
      // Planos sem nenhuma mensagem no mês: uso real é zero.
      for (const id of PLAN_IDS) {
        if (!(ai.byPlan ?? []).some((row) => row.plan === id) && plans[id].subscribers > 0) {
          plans[id] = { ...plans[id], aiUtilization: 0 };
        }
      }
    }
  }

  return { inputs: { ...base, plans, ai: aiInputs }, aiSource: measured ? 'medido' : 'estimado' };
}

export interface RealModel {
  model: ModelResult;
  // Custo de IA do mês calculado com os tokens e transcrições que de fato foram usados.
  aiReal: number;
  variableReal: number;
  profitReal: number;
}

// Aplica à empresa de verdade (lojas por plano e consumo de IA medido) os preços e custos
// editáveis. Assim a Visão geral mostra o resultado estimado do mês com os números reais.
export function modelWithRealData(inputs: CostInputs, overview: AdminOverview): RealModel {
  const { inputs: real } = applyRealData(inputs, overview);
  // Aqui a IA entra pelo total medido (tokens), não por estimativa de uso por plano.
  const model = computeModel(real);

  const { ai, fx } = inputs;
  const tokens = overview.ai.current;
  const inputRate = (1 - ai.cachedShare) * ai.priceIn + ai.cachedShare * ai.priceCached;
  const chatUsd = (tokens.inputTokens / 1e6) * inputRate + (tokens.outputTokens / 1e6) * ai.priceOut;
  const voiceUsd = tokens.transcriptions * ((ai.voiceSeconds / 60) * ai.transcribePerMin);
  const aiReal = (chatUsd + voiceUsd) * fx;

  const variableReal = model.variableCost - model.aiTotal + aiReal;
  return { model, aiReal, variableReal, profitReal: model.mrr - variableReal - model.fixedBrl };
}
