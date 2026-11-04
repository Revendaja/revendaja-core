import { resolvePeriod, usagePeriod } from '../ai.period';

// Quarta-feira, 15/10/2025, 22:30 em Brasília (= 01:30 UTC de quinta, 16/10): o "hoje" da usuária
// ainda é dia 15, mesmo com o servidor já em outro dia (UTC).
const NOW = new Date('2025-10-16T01:30:00.000Z');

function iso(date: Date): string {
  return date.toISOString();
}

describe('resolvePeriod', () => {
  it('"hoje" usa o dia de Brasília, não o do servidor (UTC)', () => {
    const period = resolvePeriod({ period: 'today' }, NOW);
    expect(iso(period.from)).toBe('2025-10-15T03:00:00.000Z');
    expect(iso(period.to)).toBe('2025-10-16T03:00:00.000Z');
    expect(period.previous.label).toBe('ontem');
  });

  it('esta semana vai de segunda a segunda', () => {
    const period = resolvePeriod({ period: 'this_week' }, NOW);
    expect(iso(period.from)).toBe('2025-10-13T03:00:00.000Z');
    expect(iso(period.to)).toBe('2025-10-20T03:00:00.000Z');
  });

  it('numa segunda-feira a semana começa no próprio dia', () => {
    const monday = new Date('2025-10-13T15:00:00.000Z');
    expect(iso(resolvePeriod({ period: 'this_week' }, monday).from)).toBe(
      '2025-10-13T03:00:00.000Z',
    );
  });

  it('num domingo a semana ainda é a que começou na segunda anterior', () => {
    const sunday = new Date('2025-10-19T15:00:00.000Z');
    expect(iso(resolvePeriod({ period: 'this_week' }, sunday).from)).toBe(
      '2025-10-13T03:00:00.000Z',
    );
  });

  it('este mês e o mês passado (com o mês anterior como comparação)', () => {
    const month = resolvePeriod({ period: 'this_month' }, NOW);
    expect(iso(month.from)).toBe('2025-10-01T03:00:00.000Z');
    expect(iso(month.to)).toBe('2025-11-01T03:00:00.000Z');
    expect(iso(month.previous.from)).toBe('2025-09-01T03:00:00.000Z');
    expect(iso(month.previous.to)).toBe('2025-10-01T03:00:00.000Z');

    const last = resolvePeriod({ period: 'last_month' }, NOW);
    expect(iso(last.from)).toBe('2025-09-01T03:00:00.000Z');
    expect(iso(last.to)).toBe('2025-10-01T03:00:00.000Z');
  });

  it('o mês vira o ano corretamente', () => {
    const january = new Date('2026-01-10T12:00:00.000Z');
    const last = resolvePeriod({ period: 'last_month' }, january);
    expect(iso(last.from)).toBe('2025-12-01T03:00:00.000Z');
    expect(iso(last.to)).toBe('2026-01-01T03:00:00.000Z');
  });

  it('últimos 7 dias inclui hoje', () => {
    const period = resolvePeriod({ period: 'last_7_days' }, NOW);
    expect(iso(period.from)).toBe('2025-10-09T03:00:00.000Z');
    expect(iso(period.to)).toBe('2025-10-16T03:00:00.000Z');
    expect(iso(period.previous.from)).toBe('2025-10-02T03:00:00.000Z');
  });

  it('período personalizado inclui o último dia', () => {
    const period = resolvePeriod(
      { period: 'custom', startDate: '2025-10-01', endDate: '2025-10-15' },
      NOW,
    );
    expect(iso(period.from)).toBe('2025-10-01T03:00:00.000Z');
    expect(iso(period.to)).toBe('2025-10-16T03:00:00.000Z');
    expect(period.label).toBe('de 01/10/2025 a 15/10/2025');
  });

  it('recusa período personalizado inválido', () => {
    expect(() => resolvePeriod({ period: 'custom' }, NOW)).toThrow('startDate');
    expect(() =>
      resolvePeriod({ period: 'custom', startDate: '2025-10-10', endDate: '2025-10-01' }, NOW),
    ).toThrow('anterior');
    expect(() =>
      resolvePeriod({ period: 'custom', startDate: '2025-02-31', endDate: '2025-03-05' }, NOW),
    ).toThrow('data válida');
    expect(() =>
      resolvePeriod({ period: 'custom', startDate: '2020-01-01', endDate: '2025-01-01' }, NOW),
    ).toThrow('no máximo');
  });
});

describe('usagePeriod', () => {
  it('conta o mês pelo calendário de Brasília', () => {
    // 01/11 02:00 UTC ainda é 31/10 23:00 em Brasília: pertence a outubro.
    const lateOctober = usagePeriod(new Date('2025-11-01T02:00:00.000Z'));
    expect(lateOctober.key).toBe('2025-10');
    expect(lateOctober.resetsAt.toISOString()).toBe('2025-11-01T03:00:00.000Z');
  });

  it('vira o ano', () => {
    const december = usagePeriod(new Date('2025-12-20T12:00:00.000Z'));
    expect(december.key).toBe('2025-12');
    expect(december.resetsAt.toISOString()).toBe('2026-01-01T03:00:00.000Z');
  });
});
