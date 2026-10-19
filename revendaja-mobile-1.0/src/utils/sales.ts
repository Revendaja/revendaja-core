import type { Ionicons } from '@expo/vector-icons';
import type { NewSalePaymentMethod, SaleListItem, SalePaymentMethod, SaleStatusValue } from '../api/types';

type IconName = keyof typeof Ionicons.glyphMap;

// `on_account` (fiado) só existe em vendas antigas; segue aqui para elas continuarem com ícone e texto.
export const PAYMENT_ICON: Record<SalePaymentMethod, IconName> = {
  pix: 'qr-code-outline',
  card: 'card-outline',
  cash: 'cash-outline',
  on_account: 'time-outline',
};

// Chips de forma de pagamento da tela Nova Venda (sem fiado: toda venda nova já nasce paga).
export const PAYMENT_CHIPS: { method: NewSalePaymentMethod; label: string }[] = [
  { method: 'pix', label: 'Pix' },
  { method: 'card', label: 'Cartão' },
  { method: 'cash', label: 'Dinheiro' },
];

export function paymentLabel(method: SalePaymentMethod, installments: number | null): string {
  switch (method) {
    case 'pix':
      return 'Pix Direto';
    case 'card':
      return `Cartão ${installments && installments > 1 ? `${installments}x` : 'à vista'}`;
    case 'cash':
      return 'Dinheiro em mãos';
    case 'on_account':
      return 'Anotado na conta';
  }
}

export const STATUS_LABEL: Record<SaleStatusValue, string> = {
  paid: 'Recebido',
  pending: 'A receber',
  cancelled: 'Cancelado',
};

// ---------------------------------------------------------------------------
// Períodos e datas (sempre no fuso do aparelho; a API recebe/devolve ISO-8601)
// ---------------------------------------------------------------------------

export type Period = 'week' | 'month' | 'year';

export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// Limites do período para o filtro da API: `from` inclusivo, `to` exclusivo (meia-noite local).
// - week: últimos 7 dias, incluindo hoje · month: o mês escolhido (0-11) do ano atual · year: o ano atual.
export function periodRange(period: Period, month: number, now: Date): { from: Date; to: Date } {
  const year = now.getFullYear();
  if (period === 'year') return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) };
  if (period === 'month') return { from: new Date(year, month, 1), to: new Date(year, month + 1, 1) };
  return {
    from: new Date(year, now.getMonth(), now.getDate() - 6),
    to: new Date(year, now.getMonth(), now.getDate() + 1),
  };
}

// Os últimos `days` dias, contando hoje (meia-noite local): `from` inclusivo e `to` exclusivo.
export function lastDaysRange(days: number, now: Date): { from: Date; to: Date } {
  const year = now.getFullYear();
  return {
    from: new Date(year, now.getMonth(), now.getDate() - (days - 1)),
    to: new Date(year, now.getMonth(), now.getDate() + 1),
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

// "2026-09-23" (dia local) de um instante ISO.
export function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

export function formatDateFull(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// "Hoje", "Ontem" ou "23/09 · Quarta-feira"
export function formatDayLabel(key: string, now: Date): string {
  const day = parseDayKey(key);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${pad(day.getDate())}/${pad(day.getMonth() + 1)} · ${WEEKDAYS[day.getDay()]}`;
}

export type SaleDaySection = { key: string; total: number; data: SaleListItem[] };

// Agrupa as vendas carregadas por dia (mais recente primeiro). O total do dia soma só o que já foi carregado:
// se o dia atravessa duas páginas, ele se completa quando a próxima página chega.
export function groupSalesByDay(sales: SaleListItem[]): SaleDaySection[] {
  const byDay = new Map<string, SaleListItem[]>();
  for (const sale of sales) {
    const key = dayKey(sale.createdAt);
    const list = byDay.get(key) ?? [];
    list.push(sale);
    byDay.set(key, list);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, data]) => ({ key, total: roundMoney(data.reduce((sum, sale) => sum + sale.total, 0)), data }));
}

// Evita ruído de ponto flutuante ao somar reais (0.1 + 0.2).
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
