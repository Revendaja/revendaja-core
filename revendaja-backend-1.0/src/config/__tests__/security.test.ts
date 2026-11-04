import { apiDocsEnabled, buildOriginMatcher, type CorsConfig } from '../security';

const PRODUCTION: CorsConfig = {
  nodeEnv: 'production',
  storeBaseDomain: 'revendaja.com',
  webAppUrl: 'https://app.revendaja.com',
  extraOrigins: [],
};

describe('CORS em produção', () => {
  const allowed = buildOriginMatcher(PRODUCTION);

  it.each([
    'https://revendaja.com',
    'https://www.revendaja.com',
    'https://app.revendaja.com',
    'https://vianastore.revendaja.com',
    'https://loja-da-ana.revendaja.com',
    'https://REVENDAJA.com',
    'https://revendaja.com/',
  ])('aceita %s', (origin) => {
    expect(allowed(origin)).toBe(true);
  });

  it.each([
    'https://evil.com',
    'https://revendaja.com.evil.com',
    'https://evilrevendaja.com',
    'https://revendaja.com@evil.com',
    'http://revendaja.com',
    'http://vianastore.revendaja.com',
    'https://a.b.evil.com',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'null',
  ])('recusa %s', (origin) => {
    expect(allowed(origin)).toBe(false);
  });

  it('aceita quem não manda Origin (app do celular, servidor para servidor)', () => {
    expect(allowed(undefined)).toBe(true);
  });

  it('aceita as origens extras da configuração', () => {
    const withExtra = buildOriginMatcher({
      ...PRODUCTION,
      extraOrigins: ['https://parceiro.com', ' https://outro.com/ '],
    });
    expect(withExtra('https://parceiro.com')).toBe(true);
    expect(withExtra('https://outro.com')).toBe(true);
    expect(withExtra('https://nao-listado.com')).toBe(false);
  });

  it('aceita o painel mesmo fora do domínio das vitrines', () => {
    const external = buildOriginMatcher({ ...PRODUCTION, webAppUrl: 'https://painel.vercel.app' });
    expect(external('https://painel.vercel.app')).toBe(true);
    expect(external('https://outro.vercel.app')).toBe(false);
  });
});

describe('CORS em desenvolvimento', () => {
  const allowed = buildOriginMatcher({
    nodeEnv: 'development',
    storeBaseDomain: 'localhost:3001',
    webAppUrl: 'http://localhost:3001',
    extraOrigins: [],
  });

  it('aceita as telas abertas na própria máquina e as vitrines de teste', () => {
    expect(allowed('http://localhost:3001')).toBe(true);
    expect(allowed('http://localhost:8081')).toBe(true);
    expect(allowed('http://127.0.0.1:3001')).toBe(true);
    expect(allowed('http://vianastore.localhost:3001')).toBe(true);
  });

  it('continua recusando sites de fora', () => {
    expect(allowed('https://evil.com')).toBe(false);
    expect(allowed('http://localhost.evil.com')).toBe(false);
  });
});

describe('documentação interativa (/docs)', () => {
  it('em produção fica desligada por padrão', () => {
    expect(apiDocsEnabled('production', undefined)).toBe(false);
  });

  it('em produção só liga se for pedido de propósito', () => {
    expect(apiDocsEnabled('production', 'true')).toBe(true);
    expect(apiDocsEnabled('production', 'false')).toBe(false);
  });

  it('em desenvolvimento fica ligada por padrão e pode ser desligada', () => {
    expect(apiDocsEnabled('development', undefined)).toBe(true);
    expect(apiDocsEnabled('development', 'false')).toBe(false);
  });

  it('nos testes nunca liga (o Swagger UI conflita com o Jest)', () => {
    expect(apiDocsEnabled('test', 'true')).toBe(false);
    expect(apiDocsEnabled('test', undefined)).toBe(false);
  });
});
