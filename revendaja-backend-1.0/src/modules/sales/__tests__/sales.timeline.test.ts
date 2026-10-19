import { buildSalesTimeline } from '../sales.timeline';
import type { TimelineSaleRow } from '../sales.types';

function sale(
  iso: string,
  totalCents: number,
  costCents = 0,
  hasUncostedItem = false,
): TimelineSaleRow {
  return { createdAt: new Date(iso), totalCents, costCents, hasUncostedItem };
}

describe('buildSalesTimeline', () => {
  it('agrupa por mês, preenche meses sem venda com zero e soma receita e custo', () => {
    const timeline = buildSalesTimeline({
      sales: [
        sale('2026-01-10T12:00:00.000Z', 10_000, 4_000),
        sale('2026-01-20T12:00:00.000Z', 5_000, 2_000),
        sale('2026-03-05T12:00:00.000Z', 20_000, 9_000),
      ],
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-04-01T00:00:00.000Z'),
      groupBy: 'month',
      tzOffsetMinutes: 0,
    });

    expect(
      timeline.items.map((item) => [item.periodStart.toISOString(), item.revenue, item.cost]),
    ).toEqual([
      ['2026-01-01T00:00:00.000Z', 150, 60],
      ['2026-02-01T00:00:00.000Z', 0, 0],
      ['2026-03-01T00:00:00.000Z', 200, 90],
    ]);
    expect(timeline.costIsPartial).toBe(false);
  });

  it('usa o fuso informado para decidir em que dia a venda caiu', () => {
    // 01:00 UTC do dia 2 = 22:00 do dia 1 em São Paulo (UTC-3).
    const timeline = buildSalesTimeline({
      sales: [sale('2026-09-02T01:00:00.000Z', 10_000)],
      from: new Date('2026-09-01T03:00:00.000Z'),
      to: new Date('2026-09-03T03:00:00.000Z'),
      groupBy: 'day',
      tzOffsetMinutes: -180,
    });

    expect(timeline.items.map((item) => [item.periodStart.toISOString(), item.revenue])).toEqual([
      ['2026-09-01T03:00:00.000Z', 100],
      ['2026-09-02T03:00:00.000Z', 0],
    ]);
  });

  it('semana começa na segunda-feira', () => {
    // 2026-09-06 é domingo (semana de 31/08); 2026-09-07 é segunda.
    const timeline = buildSalesTimeline({
      sales: [sale('2026-09-06T12:00:00.000Z', 1_000), sale('2026-09-07T12:00:00.000Z', 2_000)],
      from: new Date('2026-08-31T00:00:00.000Z'),
      to: new Date('2026-09-14T00:00:00.000Z'),
      groupBy: 'week',
      tzOffsetMinutes: 0,
    });

    expect(timeline.items.map((item) => [item.periodStart.toISOString(), item.revenue])).toEqual([
      ['2026-08-31T00:00:00.000Z', 10],
      ['2026-09-07T00:00:00.000Z', 20],
    ]);
  });

  it('marca o custo como parcial quando algum item pago não tem custo', () => {
    const timeline = buildSalesTimeline({
      sales: [sale('2026-09-10T12:00:00.000Z', 1_000, 0, true)],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-10-01T00:00:00.000Z'),
      groupBy: 'month',
      tzOffsetMinutes: 0,
    });

    expect(timeline.costIsPartial).toBe(true);
  });

  it('período sem vendas devolve só zeros', () => {
    const timeline = buildSalesTimeline({
      sales: [],
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
      groupBy: 'day',
      tzOffsetMinutes: 0,
    });

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items.every((item) => item.revenue === 0 && item.cost === 0)).toBe(true);
  });
});
