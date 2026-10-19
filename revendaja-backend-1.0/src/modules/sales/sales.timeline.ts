import { fromCents } from './sales.money';
import type { SalesTimeline, TimelineGroupBy, TimelinePoint, TimelineSaleRow } from './sales.types';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// O dia/semana/mês começa no fuso de quem consulta, não em UTC. Para isso deslocamos os instantes
// pelo offset (minutos a leste de UTC) e usamos os getters UTC como se fossem a hora local; na
// saída, desfazemos o deslocamento.
function bucketStart(shifted: number, groupBy: TimelineGroupBy): number {
  const date = new Date(shifted);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (groupBy === 'month') return Date.UTC(year, month, 1);

  const dayStart = Date.UTC(year, month, day);
  if (groupBy === 'day') return dayStart;

  // Semana começa na segunda-feira.
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return dayStart - sinceMonday * DAY_MS;
}

function nextBucket(start: number, groupBy: TimelineGroupBy): number {
  if (groupBy === 'day') return start + DAY_MS;
  if (groupBy === 'week') return start + 7 * DAY_MS;
  const date = new Date(start);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

// Receita = total das vendas PAGAS; custo = unitCost * quantidade dos itens pagos que têm custo.
// Todos os períodos entre `from` e `to` aparecem, mesmo sem venda (zerados), para o gráfico não
// ter buracos. O primeiro/último período podem ser parciais (o recorte é por from/to).
export function buildSalesTimeline(input: {
  sales: TimelineSaleRow[];
  from: Date;
  to: Date;
  groupBy: TimelineGroupBy;
  tzOffsetMinutes: number;
}): SalesTimeline {
  const { sales, from, to, groupBy, tzOffsetMinutes } = input;
  const offsetMs = tzOffsetMinutes * MINUTE_MS;

  const buckets = new Map<number, { revenueCents: number; costCents: number }>();
  const lastStart = bucketStart(to.getTime() - 1 + offsetMs, groupBy);
  for (
    let start = bucketStart(from.getTime() + offsetMs, groupBy);
    start <= lastStart;
    start = nextBucket(start, groupBy)
  ) {
    buckets.set(start, { revenueCents: 0, costCents: 0 });
  }

  let costIsPartial = false;
  for (const sale of sales) {
    const bucket = buckets.get(bucketStart(sale.createdAt.getTime() + offsetMs, groupBy));
    if (!bucket) continue;
    bucket.revenueCents += sale.totalCents;
    bucket.costCents += sale.costCents;
    if (sale.hasUncostedItem) costIsPartial = true;
  }

  const items: TimelinePoint[] = [...buckets.entries()].map(([start, totals]) => ({
    periodStart: new Date(start - offsetMs),
    revenue: fromCents(totals.revenueCents),
    cost: fromCents(totals.costCents),
  }));

  return { groupBy, costIsPartial, items };
}
