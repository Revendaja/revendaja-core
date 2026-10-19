// UUID v4 (aleatório seguro) para o clientRequestId da venda.
export function newRequestId(): string {
  return crypto.randomUUID();
}
