jest.mock('../../../database/prisma', () => ({
  prisma: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
}));

import { buildApp } from '../../../app';

describe('GET /health', () => {
  it('retorna status ok quando o banco responde', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });

    await app.close();
  });
});
