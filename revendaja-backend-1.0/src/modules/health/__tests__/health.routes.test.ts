const queryRaw = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

import { buildApp } from '../../../app';

async function get(url: string) {
  const app = await buildApp();
  try {
    return await app.inject({ method: 'GET', url });
  } finally {
    await app.close();
  }
}

beforeEach(() => {
  queryRaw.mockReset();
  queryRaw.mockResolvedValue([{ '?column?': 1 }]);
});

describe('GET /health (o servidor está de pé)', () => {
  it('responde ok sem consultar o banco', async () => {
    const response = await get('/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('continua respondendo ok mesmo com o banco fora do ar (é só "o processo está vivo")', async () => {
    queryRaw.mockRejectedValue(new Error('banco fora do ar'));

    expect((await get('/health')).statusCode).toBe(200);
  });
});

describe('GET /health/ready (o servidor e o banco funcionam)', () => {
  it('responde ok e mostra o tempo da consulta quando o banco responde', async () => {
    const response = await get('/health/ready');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', database: 'ok' });
    expect(typeof response.json().databaseLatencyMs).toBe('number');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('responde 503 quando o banco não responde', async () => {
    queryRaw.mockRejectedValue(new Error('banco fora do ar'));

    const response = await get('/health/ready');

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'unavailable', database: 'down' });
  });
});
