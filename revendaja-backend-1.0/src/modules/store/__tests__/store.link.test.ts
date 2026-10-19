const mockEnv: { STORE_BASE_DOMAIN: string; STORE_LINK_SCHEME?: 'http' | 'https' } = {
  STORE_BASE_DOMAIN: 'revendaja.com',
};
jest.mock('../../../config/env', () => ({ env: mockEnv }));

import { buildCatalogLink, withCatalogLink } from '../store.link';

describe('buildCatalogLink', () => {
  beforeEach(() => {
    mockEnv.STORE_BASE_DOMAIN = 'revendaja.com';
    delete mockEnv.STORE_LINK_SCHEME;
  });

  it('produção: https no domínio base', () => {
    expect(buildCatalogLink('vianastore')).toBe('https://vianastore.revendaja.com');
  });

  it('localhost (com ou sem porta): http, sem precisar configurar o esquema', () => {
    mockEnv.STORE_BASE_DOMAIN = 'localhost:3001';
    expect(buildCatalogLink('vianastore')).toBe('http://vianastore.localhost:3001');

    mockEnv.STORE_BASE_DOMAIN = 'localhost';
    expect(buildCatalogLink('vianastore')).toBe('http://vianastore.localhost');
  });

  it('STORE_LINK_SCHEME tem prioridade sobre o esquema deduzido', () => {
    mockEnv.STORE_BASE_DOMAIN = 'localhost:3001';
    mockEnv.STORE_LINK_SCHEME = 'https';
    expect(buildCatalogLink('vianastore')).toBe('https://vianastore.localhost:3001');
  });

  it('domínio que só começa com "localhost" não é local', () => {
    mockEnv.STORE_BASE_DOMAIN = 'localhost.revendaja.com';
    expect(buildCatalogLink('vianastore')).toBe('https://vianastore.localhost.revendaja.com');
  });
});

describe('withCatalogLink', () => {
  it('troca o link gravado (de outro ambiente) pelo link do ambiente atual, sem mexer no resto', () => {
    mockEnv.STORE_BASE_DOMAIN = 'localhost:3001';
    delete mockEnv.STORE_LINK_SCHEME;

    const store = {
      handle: 'vianastore',
      catalogLink: 'https://vianastore.revendaja.com',
      storeName: 'Viana Store',
    };

    expect(withCatalogLink(store)).toEqual({
      handle: 'vianastore',
      catalogLink: 'http://vianastore.localhost:3001',
      storeName: 'Viana Store',
    });
    expect(store.catalogLink).toBe('https://vianastore.revendaja.com');
  });
});
