export interface PromotionTemplate {
  title: string;
  message: string;
}

// Mensagens variadas pra dica de vendas automática (a cada N dias, ver notifications.promotion.ts)
// — a spec pede só "variar", não garantir ausência de repetição consecutiva.
export const PROMOTION_TEMPLATES: PromotionTemplate[] = [
  {
    title: 'Hora de vender! 💰',
    message: 'Que tal oferecer 10% de desconto em alguns produtos hoje?',
  },
  {
    title: 'Dica de vendas 📈',
    message: 'Escolha 3 produtos do seu estoque e crie uma promoção para seus clientes hoje.',
  },
  {
    title: 'Aumente suas vendas 🔥',
    message:
      'Produtos parados no estoque podem virar uma ótima promoção. Confira seu estoque e escolha alguns produtos para divulgar.',
  },
];

export function pickPromotionTemplate(random: () => number = Math.random): PromotionTemplate {
  const index = Math.floor(random() * PROMOTION_TEMPLATES.length);
  return PROMOTION_TEMPLATES[index];
}
