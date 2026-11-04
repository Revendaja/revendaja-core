import { AppError } from '../../shared/errors/AppError';

// America/Sao_Paulo é UTC-3 o ano todo (o Brasil não tem horário de verão desde 2019). Os períodos
// ("este mês", "hoje") são sempre os da usuária, não os do servidor (UTC).
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_RANGE_DAYS = 366;

export const PERIODS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days',
  'custom',
] as const;
export type Period = (typeof PERIODS)[number];

export interface PeriodInput {
  period: Period;
  // YYYY-MM-DD, só com `custom` (os dois dias entram no período).
  startDate?: string;
  endDate?: string;
}

export interface ResolvedPeriod {
  label: string;
  // `from` inclusivo, `to` exclusivo (mesma convenção de GET /sales/summary).
  from: Date;
  to: Date;
  // O período imediatamente anterior, de mesmo tamanho (mês fechado -> mês anterior).
  previous: { label: string; from: Date; to: Date };
}

function startOfDay(instant: Date): Date {
  const local = new Date(instant.getTime() - BRT_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + BRT_OFFSET_MS,
  );
}

function startOfMonth(instant: Date, monthOffset = 0): Date {
  const local = new Date(instant.getTime() - BRT_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + monthOffset, 1) + BRT_OFFSET_MS,
  );
}

// Segunda-feira é o primeiro dia da semana.
function startOfWeek(instant: Date): Date {
  const day = startOfDay(instant);
  const weekday = new Date(day.getTime() - BRT_OFFSET_MS).getUTCDay(); // 0 = domingo
  const sinceMonday = (weekday + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS);
}

function formatDay(instant: Date): string {
  const local = new Date(instant.getTime() - BRT_OFFSET_MS);
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${local.getUTCFullYear()}`;
}

function parseDay(value: string | undefined, field: string): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) {
    throw new AppError(`Informe ${field} no formato AAAA-MM-DD.`, 400, 'INVALID_PERIOD');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day) + BRT_OFFSET_MS);
  const local = new Date(date.getTime() - BRT_OFFSET_MS);
  // Dia 31 de fevereiro "rola" para março: se o mês mudou, a data não existe.
  if (local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) {
    throw new AppError(`${field} não é uma data válida.`, 400, 'INVALID_PERIOD');
  }
  return date;
}

function sameLengthBefore(label: string, from: Date, to: Date): ResolvedPeriod['previous'] {
  const length = to.getTime() - from.getTime();
  return { label, from: new Date(from.getTime() - length), to: from };
}

export function resolvePeriod(input: PeriodInput, now: Date = new Date()): ResolvedPeriod {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  switch (input.period) {
    case 'today':
      return {
        label: 'hoje',
        from: today,
        to: tomorrow,
        previous: sameLengthBefore('ontem', today, tomorrow),
      };
    case 'yesterday': {
      const from = new Date(today.getTime() - DAY_MS);
      return {
        label: 'ontem',
        from,
        to: today,
        previous: sameLengthBefore('anteontem', from, today),
      };
    }
    case 'this_week': {
      const from = startOfWeek(now);
      const to = new Date(from.getTime() + 7 * DAY_MS);
      return {
        label: 'esta semana',
        from,
        to,
        previous: sameLengthBefore('semana passada', from, to),
      };
    }
    case 'last_week': {
      const to = startOfWeek(now);
      const from = new Date(to.getTime() - 7 * DAY_MS);
      return {
        label: 'semana passada',
        from,
        to,
        previous: sameLengthBefore('semana retrasada', from, to),
      };
    }
    case 'this_month': {
      const from = startOfMonth(now);
      return {
        label: 'este mês',
        from,
        to: startOfMonth(now, 1),
        previous: { label: 'mês passado', from: startOfMonth(now, -1), to: from },
      };
    }
    case 'last_month': {
      const from = startOfMonth(now, -1);
      return {
        label: 'mês passado',
        from,
        to: startOfMonth(now),
        previous: { label: 'mês retrasado', from: startOfMonth(now, -2), to: from },
      };
    }
    case 'last_7_days': {
      const from = new Date(today.getTime() - 6 * DAY_MS);
      return {
        label: 'últimos 7 dias',
        from,
        to: tomorrow,
        previous: sameLengthBefore('7 dias anteriores', from, tomorrow),
      };
    }
    case 'last_30_days': {
      const from = new Date(today.getTime() - 29 * DAY_MS);
      return {
        label: 'últimos 30 dias',
        from,
        to: tomorrow,
        previous: sameLengthBefore('30 dias anteriores', from, tomorrow),
      };
    }
    case 'custom': {
      const from = parseDay(input.startDate, 'startDate');
      const lastDay = parseDay(input.endDate, 'endDate');
      if (lastDay.getTime() < from.getTime()) {
        throw new AppError(
          'startDate deve ser anterior ou igual a endDate.',
          400,
          'INVALID_PERIOD',
        );
      }
      const to = new Date(lastDay.getTime() + DAY_MS);
      if ((to.getTime() - from.getTime()) / DAY_MS > MAX_CUSTOM_RANGE_DAYS) {
        throw new AppError(
          `O período pode ter no máximo ${MAX_CUSTOM_RANGE_DAYS} dias.`,
          400,
          'INVALID_PERIOD',
        );
      }
      return {
        label: `de ${formatDay(from)} a ${formatDay(lastDay)}`,
        from,
        to,
        previous: sameLengthBefore('período anterior', from, to),
      };
    }
  }
}

export interface UsagePeriod {
  // "AAAA-MM", no fuso de Brasília.
  key: string;
  // Início do mês seguinte: quando o limite volta a zerar.
  resetsAt: Date;
}

// Mês de calendário (Brasília) em que o consumo do assistente é contado.
export function usagePeriod(now: Date = new Date()): UsagePeriod {
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  return { key: `${local.getUTCFullYear()}-${month}`, resetsAt: startOfMonth(now, 1) };
}
