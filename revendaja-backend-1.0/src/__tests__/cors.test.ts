jest.mock('../database/prisma', () => ({
  prisma: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
}));

import { buildApp } from '../app';

describe('CORS', () => {
  // Preflight que o navegador faz antes de PATCH/DELETE com header Authorization.
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'o preflight libera o método %s',
    async (method) => {
      const app = await buildApp();

      const response = await app.inject({
        method: 'OPTIONS',
        url: '/store/products',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization,content-type',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain(method);
      expect(response.headers['access-control-allow-headers']).toMatch(/authorization/i);

      await app.close();
    },
  );
});
