export function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "5511982214432" -> "(11) 98221-4432"
export function formatWhatsapp(digits: string) {
  const national = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return digits;
}

export function whatsappUrl(digits: string) {
  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

// Sem centavos, para valores redondos como a meta de vendas: 5000 -> "R$ 5.000".
export function formatCurrencyWhole(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

// Data relativa curta pra notificação: "agora", "há 5 min", "há 2h", "ontem" ou "23/09".
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 1) return 'ontem';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Estoque: inteiro de 0 a 1.000.000.
export const STOCK_MAX = 1000000;

// "Preço sugerido" só existe quando o catálogo informa um valor: cerca de 30% dos produtos têm basePrice = 0.
export function hasSuggestedPrice(basePrice: number) {
  return basePrice > 0;
}

export const STOCK_ERROR_MESSAGE = 'Informe a quantidade em estoque (número inteiro de 0 a 1.000.000).';
export const PRICE_ERROR_MESSAGE = 'Informe um valor válido, com no máximo 2 casas decimais (ex.: 49,90).';

const MAX_PRICE = 99999999.99;
const MAX_PRICE_CENTS = Math.round(MAX_PRICE * 100);
// Formato brasileiro: "49,90" ou "1.234,56" (ponto só como separador de milhar, antes da vírgula).
const BR_PRICE = /^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/;
// Formato simples com ponto decimal: "49" ou "49.9".
const PLAIN_PRICE = /^\d+(\.\d{1,2})?$/;

// 49.9 -> "49,90" (para preencher o campo de preço)
export function formatPriceInput(value: number) {
  return value.toFixed(2).replace('.', ',');
}

// Máscara de campo de preço: digitar "4990" forma "49,90" (cada dígito entra nos centavos e empurra o
// resto para a esquerda). Sempre deriva o valor do texto INTEIRO, então apagar ou colar também corrige.
export function maskPriceInput(text: string): string {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10);
  if (!digits) return '';
  const cents = Math.min(Number(digits), MAX_PRICE_CENTS);
  return (cents / 100).toFixed(2).replace('.', ',');
}

// "R$ 49,90" / "49,9" / "1.234,56" / "49.9" -> número em reais. Retorna null se inválido (nunca "adivinha").
// Regras da API: número >= 0, no máximo 2 casas decimais e no máximo 99999999.99.
export function parsePriceInput(text: string): number | null {
  const value = text.replace(/R\$|\s/g, '');
  if (!value) return null;

  let normalized: string;
  if (value.includes(',')) {
    if (!BR_PRICE.test(value)) return null;
    normalized = value.replace(/\./g, '').replace(',', '.');
  } else {
    if (!PLAIN_PRICE.test(value)) return null;
    normalized = value;
  }

  const number = Number(normalized);
  return number <= MAX_PRICE ? number : null;
}

// Quantidade em estoque: inteiro de 0 a 1.000.000. Retorna null se inválido.
export function parseStockInput(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,7}$/.test(value)) return null;
  const number = Number(value);
  return number <= STOCK_MAX ? number : null;
}
