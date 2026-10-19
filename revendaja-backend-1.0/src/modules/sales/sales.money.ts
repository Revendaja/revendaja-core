// Todo cálculo de dinheiro é feito em CENTAVOS inteiros: em ponto flutuante,
// 0.1 + 0.2 dá 0.30000000000000004 e um total de venda sairia com lixo nas
// casas decimais. Só na borda (entrada/saída) convertemos de/para reais.
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

// Percentual com 2 casas (ex.: 42.86).
export function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}
