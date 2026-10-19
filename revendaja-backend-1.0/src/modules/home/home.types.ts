import type { LowStockProduct, StorePlan } from '../store/store.types';

// Card "Meta de Vendas".
export interface HomeGoal {
  // Meta mensal escolhida pela loja, em reais.
  target: number;
  // Progresso de 0 a 100 (limitado em 100: a barra não passa do fim).
  percent: number;
  // Quanto falta para bater a meta, em reais. 0 quando já bateu.
  remaining: number;
}

// Tudo que a tela Início mostra, num só payload.
export interface Home {
  // Badge do plano ao lado do nome.
  plan: { id: StorePlan; name: string };
  // Card "Faturamento em <mês>".
  revenue: {
    // Só vendas PAGAS do período: fiado pendente não conta até ser recebido.
    total: number;
    // Variação sobre o período anterior (também só vendas pagas). null quando o anterior
    // não teve faturamento (não há base de comparação).
    growthPercent: number | null;
  };
  // null = a loja ainda não escolheu a meta: o app pede para selecionar uma.
  goal: HomeGoal | null;
  // Seção "Atenção necessária".
  alerts: {
    lowStock: {
      // Limite usado (estoque <= threshold); o app não precisa repetir a regra.
      threshold: number;
      // Total de produtos em baixa (inclui esgotados e os cadastrados sem estoque, que valem 0).
      count: number;
      // Os mais críticos primeiro; só alguns (o alerta mostra poucos nomes).
      products: LowStockProduct[];
    };
    // Vendas a receber (fiado), de qualquer período.
    pendingSales: { count: number };
  };
}
