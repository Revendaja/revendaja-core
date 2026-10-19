import type { StorePlan } from './store.types';

// Nome exibido de cada plano (badge da Home, tela Mais e mensagens de limite atingido).
export const STORE_PLAN_NAMES: Record<StorePlan, string> = {
  free: 'Gratuito',
  starter: 'Inicial',
  premium: 'Pro',
  business: 'Empresarial',
};

// Limites e recursos liberados por plano (ver docs/CUSTOS_E_PLANOS.md para a proposta completa).
// `maxProducts: null` = sem limite de produtos.
export interface StorePlanLimits {
  maxProducts: number | null;
  manualProductsEnabled: boolean;
  categoriesEnabled: boolean;
  promotionsEnabled: boolean;
}

export const STORE_PLAN_LIMITS: Record<StorePlan, StorePlanLimits> = {
  free: {
    maxProducts: 30,
    manualProductsEnabled: false,
    categoriesEnabled: false,
    promotionsEnabled: false,
  },
  starter: {
    maxProducts: 200,
    manualProductsEnabled: true,
    categoriesEnabled: true,
    promotionsEnabled: true,
  },
  premium: {
    maxProducts: null,
    manualProductsEnabled: true,
    categoriesEnabled: true,
    promotionsEnabled: true,
  },
  business: {
    maxProducts: null,
    manualProductsEnabled: true,
    categoriesEnabled: true,
    promotionsEnabled: true,
  },
};
