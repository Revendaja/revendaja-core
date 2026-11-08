import type { StorePlanId } from '@/lib/api/types';

export type PlanInfo = {
  id: StorePlanId;
  name: string;
  priceLabel: string;
  billingLabel: string;
  tagline: string;
  highlight?: boolean;
  // Espelha STORE_PLAN_LIMITS do backend (null = ilimitado). Só para avisar antes de um downgrade;
  // quem de fato barra e congela produtos é a API.
  maxProducts: number | null;
  features: string[];
};

// Mesmo catálogo de planos do app mobile (src/data/plans.ts).
export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    maxProducts: 30,
    name: 'Gratuito',
    priceLabel: 'R$ 0',
    billingLabel: '',
    tagline: 'Para testar a revenda online sem compromisso',
    features: [
      'Catálogo com até 30 produtos',
      'Vitrine virtual própria',
      'Só produtos do catálogo (sem cadastro manual)',
      'Assistente de IA (15 mensagens/mês)',
      'Resumo financeiro do mês',
      'Suporte por e-mail',
    ],
  },
  {
    id: 'starter',
    maxProducts: 200,
    name: 'Inicial',
    priceLabel: 'R$ 29,99',
    billingLabel: '/mês',
    tagline: 'Para começar a revender online de verdade',
    features: [
      'Catálogo com até 200 produtos',
      'Cadastro manual e cestas (kits)',
      'Categorias e preço promocional',
      'Assistente de IA (150 mensagens/mês, texto e voz)',
      'Relatório dos mais vendidos',
      'Suporte por e-mail com prioridade',
    ],
  },
  {
    id: 'premium',
    maxProducts: null,
    name: 'Pro',
    priceLabel: 'R$ 49,99',
    billingLabel: '/mês',
    tagline: 'Para quem já vive da revenda',
    highlight: true,
    features: [
      'Produtos ilimitados',
      'Assistente de IA (500 mensagens/mês, texto e voz)',
      'Relatórios de produtos parados e marcas mais vendidas',
      'Vitrine sem a marca Revendajá',
      'Suporte prioritário no WhatsApp',
    ],
  },
];

export function findPlan(id: StorePlanId | undefined) {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

// Quantos produtos passariam do limite se a loja fosse para esse plano (0 = nenhum).
export function productsOverLimit(productCount: number, planId: StorePlanId) {
  const max = findPlan(planId).maxProducts;
  return max === null ? 0 : Math.max(0, productCount - max);
}

// Relatórios por plano (espelha STORE_PLAN_LIMITS do backend): mais vendidos a partir do Inicial;
// produtos parados e marcas só no Pro. Quem barra de fato é a API.
export function hasTopProductsReport(planId: StorePlanId) {
  return planRank(planId) >= planRank('starter');
}

export function hasAdvancedReports(planId: StorePlanId) {
  return planRank(planId) >= planRank('premium');
}

// Ordem do mais barato ao mais caro (a mesma da lista PLANS): decide se trocar é upgrade ou downgrade.
export function planRank(planId: StorePlanId) {
  return PLANS.findIndex((plan) => plan.id === planId);
}
