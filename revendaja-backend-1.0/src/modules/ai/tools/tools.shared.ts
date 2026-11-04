import { z } from 'zod';
import { PERIODS } from '../ai.period';

// "R$ 1.234,50" para os resumos mostrados à usuária.
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Sem acento e em minúsculas: "Natura" casa com "NATURA" e "Boticário" com "boticario".
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.');

// Campos de período compartilhados pelas ferramentas financeiras.
export const periodShape = {
  period: z
    .enum(PERIODS)
    .describe(
      'Período: today, yesterday, this_week (segunda a domingo), last_week, this_month, last_month, last_7_days, last_30_days ou custom (exige startDate e endDate).',
    ),
  startDate: isoDay.optional().describe('Primeiro dia (AAAA-MM-DD). Só com period=custom.'),
  endDate: isoDay.optional().describe('Último dia, inclusive (AAAA-MM-DD). Só com period=custom.'),
};
