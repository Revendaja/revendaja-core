// O middleware `authenticate` busca a sessão E a usuária numa consulta SQL só
// (`sessionsRepository.findByIdWithUser`, via `prisma.$queryRaw`). Os testes de rota já simulam
// `prisma.session.findUnique` e `prisma.user.findUnique`; estas funções fazem o `$queryRaw` da
// sessão devolver o mesmo que esses dois mocks devolveriam, sem reescrever cada teste.

type Mock = (...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any

const DEFAULT_USER = {
  name: 'Ana Souza',
  email: 'ana@email.com',
  whatsapp: '5511982214432',
  passwordHash: 'hash',
  googleId: null,
  role: 'user',
};

// Uma consulta escrita com `prisma.$queryRaw\`...\`` chega aqui como (partes do texto, ...valores).
export function isSessionJoinQuery(args: unknown[]): boolean {
  const parts = args[0];
  return Array.isArray(parts) && parts.join(' ').includes('FROM sessions s');
}

export async function emulateSessionJoin(
  sessionFindUnique: Mock,
  userFindUnique: Mock | undefined,
  args: unknown[],
): Promise<Record<string, unknown>[]> {
  const sessionId = args[1];
  const session = (await sessionFindUnique({ where: { id: sessionId } })) as {
    id: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
  } | null;
  if (!session) return [];

  const found = userFindUnique
    ? ((await userFindUnique({ where: { id: session.userId } })) as Record<string, unknown> | null)
    : undefined;
  // Sem mock de usuária no teste: uma usuária comum, com e-mail verificado.
  const user = found === undefined ? { ...DEFAULT_USER, phoneVerifiedAt: new Date() } : found;
  if (!user) return [];

  return [
    {
      id: session.id,
      user_id: session.userId,
      expires_at: session.expiresAt,
      created_at: session.createdAt,
      name: user.name ?? DEFAULT_USER.name,
      email: user.email ?? DEFAULT_USER.email,
      whatsapp: user.whatsapp ?? null,
      password_hash: user.passwordHash ?? null,
      google_id: user.googleId ?? null,
      phone_verified_at: user.phoneVerifiedAt ?? null,
      role: user.role ?? 'user',
      user_created_at: user.createdAt ?? new Date(),
    },
  ];
}

// Para os testes que já tinham um `$queryRaw` (busca por similaridade etc.): trata a consulta da
// sessão e entrega o resto ao mock que já existia.
export async function sessionAwareQueryRaw(
  sessionFindUnique: Mock,
  userFindUnique: Mock | undefined,
  fallback: Mock,
  args: unknown[],
): Promise<unknown> {
  if (isSessionJoinQuery(args)) return emulateSessionJoin(sessionFindUnique, userFindUnique, args);
  return fallback(...args);
}
