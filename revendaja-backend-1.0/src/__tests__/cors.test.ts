import { buildApp } from '../app';

// Teste de ponta a ponta: o servidor de verdade responde (ou não) com os cabeçalhos de CORS.
// No ambiente de testes valem STORE_BASE_DOMAIN=revendaja.com e WEB_APP_URL=http://localhost:3001.
async function call(
  origin: string | undefined,
  method: 'GET' | 'OPTIONS' = 'GET',
  url = '/health',
) {
  const app = await buildApp();
  try {
    return await app.inject({
      method,
      url,
      headers: {
        ...(origin ? { origin } : {}),
        ...(method === 'OPTIONS' ? { 'access-control-request-method': 'POST' } : {}),
      },
    });
  } finally {
    await app.close();
  }
}

describe('CORS do servidor', () => {
  it('libera o domínio, o painel e as vitrines da Revendaja', async () => {
    for (const origin of [
      'https://revendaja.com',
      'https://vianastore.revendaja.com',
      'http://localhost:3001',
    ]) {
      const response = await call(origin);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('não libera sites de fora (o navegador deles não consegue ler a resposta)', async () => {
    for (const origin of ['https://evil.com', 'https://revendaja.com.evil.com']) {
      const response = await call(origin);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('o pré-voo (OPTIONS) também só autoriza os sites da Revendaja', async () => {
    const ok = await call('https://app.revendaja.com', 'OPTIONS');
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.revendaja.com');
    expect(String(ok.headers['access-control-allow-methods'])).toContain('PATCH');

    const blocked = await call('https://evil.com', 'OPTIONS');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('o app do celular (sem Origin) continua sendo atendido normalmente', async () => {
    // Rota inexistente: o servidor chega a processar o pedido (404), nada o recusa por CORS.
    const response = await call(undefined, 'GET', '/rota-que-nao-existe');
    expect(response.statusCode).toBe(404);
  });

  it('nunca responde com "*" (qualquer site)', async () => {
    const response = await call('https://evil.com');
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });
});
