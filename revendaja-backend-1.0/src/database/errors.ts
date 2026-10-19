// Violação de índice único do Prisma (P2002): ex.: dois pedidos com o mesmo id, ou um link já usado.
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

// Violação de chave estrangeira do Prisma (P2003): ex.: apagar um produto que é componente de um
// kit (a relação usa `onDelete: Restrict` de propósito).
export function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2003';
}
