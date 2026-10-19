// Monta "?a=1&b=2" ignorando parâmetros undefined.
export function buildQuery(params: Record<string, string | number | undefined>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
