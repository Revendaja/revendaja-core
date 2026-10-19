// Monta "?a=1&b=2" ignorando parâmetros undefined.
export function buildQuery(params: Record<string, string | number | undefined>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

// Limites do mês (no fuso do navegador) para o filtro da API: `from` inclusivo, `to` exclusivo.
export function monthRange(month: number, now: Date): { from: Date; to: Date } {
  const year = now.getFullYear();
  return { from: new Date(year, month, 1), to: new Date(year, month + 1, 1) };
}
