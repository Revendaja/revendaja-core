import { fromCents, roundPercent } from './sales.money';
import type { SalesSummary, SummaryData } from './sales.types';

// Definições (combinadas com o app) — usadas por `GET /sales/summary` e por `GET /home`,
// para os dois nunca divergirem:
//  - grossRevenue: soma do total de TODAS as vendas do período (pagas + pendentes);
//  - pendingTotal: soma das pendentes;
//  - profit: só itens de vendas PAGAS que têm custo, soma de (preço - custo) * qtd;
//    null se nenhum item tiver custo;
//  - marginPercent: profit / (preço * qtd dos mesmos itens) * 100; null sem lucro;
//  - profitIsPartial: existe item pago sem custo (o lucro ignora esses itens).
export function buildSalesSummary(data: SummaryData): SalesSummary {
  let profitCents = 0;
  let costedRevenueCents = 0;
  let hasCostedItem = false;
  let hasUncostedItem = false;

  for (const item of data.paidItems) {
    if (item.unitCostCents === null) {
      hasUncostedItem = true;
      continue;
    }
    hasCostedItem = true;
    profitCents += (item.unitPriceCents - item.unitCostCents) * item.quantity;
    costedRevenueCents += item.unitPriceCents * item.quantity;
  }

  return {
    grossRevenue: fromCents(data.paidCents + data.pendingCents),
    pendingTotal: fromCents(data.pendingCents),
    profit: hasCostedItem ? fromCents(profitCents) : null,
    marginPercent:
      hasCostedItem && costedRevenueCents > 0
        ? roundPercent((profitCents / costedRevenueCents) * 100)
        : null,
    profitIsPartial: hasUncostedItem,
  };
}
