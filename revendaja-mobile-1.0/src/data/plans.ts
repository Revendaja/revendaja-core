import type { Plan } from '../types';

export const plans: Plan[] = [
  {
    id: 'free',
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
