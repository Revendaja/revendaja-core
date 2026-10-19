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
      'Todos os relatórios (mais vendidos e parados)',
      'Vitrine sem a marca Revendajá',
      'Suporte prioritário no WhatsApp',
    ],
  },
  {
    id: 'business',
    maxProducts: null,
    name: 'Empresarial',
    priceLabel: 'R$ 129,99',
    billingLabel: '/mês',
    tagline: 'Para operações em equipe',
    features: [
      'Tudo do plano Pro',
      'Múltiplas usuárias na mesma loja',
      'Exportação de dados e relatório por período',
      'Suporte dedicado',
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

// Ordem do mais barato ao mais caro (a mesma da lista PLANS): decide se trocar é upgrade ou downgrade.
export function planRank(planId: StorePlanId) {
  return PLANS.findIndex((plan) => plan.id === planId);
}
