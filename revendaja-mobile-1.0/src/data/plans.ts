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
      'Assistente de IA (15 mensagens/mês)',
      'Resumo financeiro do mês',
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
      'Assistente de IA (150 mensagens/mês, texto e voz)',
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
      'Assistente de IA (500 mensagens/mês, texto e voz)',
      'Relatórios de produtos parados e marcas mais vendidas',
      'Vitrine sem a marca Revendajá',
      'Suporte prioritário no WhatsApp',
    ],
  },
];
