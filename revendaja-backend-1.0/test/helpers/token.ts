import jwt from 'jsonwebtoken';

export const TEST_SESSION_ID = '9b2e4c1a-7d3f-4e58-a1c6-0f5d8b3a2e71';

// Usado só em testes de rota, pra simular um token de acesso já emitido no
// registro/login sem precisar passar pelo fluxo completo de novo. Carrega o
// `sid` da sessão: para o token valer, o teste também precisa fazer o mock de
// `prisma.session.findUnique` devolver `buildTestSession(...)`.
export function signTestAccessToken(userId: string, sessionId = TEST_SESSION_ID): string {
  return jwt.sign({ sub: userId, sid: sessionId }, process.env.JWT_SECRET as string, {
    expiresIn: '15m',
  });
}

export function signTestRefreshToken(userId: string, sessionId = TEST_SESSION_ID): string {
  return jwt.sign({ sub: userId, sid: sessionId }, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: '30d',
  });
}

// Linha de `sessions` que o middleware `authenticate` espera encontrar.
export function buildTestSession(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SESSION_ID,
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    createdAt: new Date(),
    ...overrides,
  };
}
