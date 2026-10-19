import { env } from '../../config/env';

const LOCAL_DOMAIN = /^localhost(:\d+)?$/i;

// Link público da vitrine: {esquema}://{handle}.{STORE_BASE_DOMAIN}. Em desenvolvimento
// (STORE_BASE_DOMAIN=localhost:3001) fica http://vianastore.localhost:3001; em produção,
// https://vianastore.revendaja.com.
export function buildCatalogLink(handle: string): string {
  const scheme =
    env.STORE_LINK_SCHEME ?? (LOCAL_DOMAIN.test(env.STORE_BASE_DOMAIN) ? 'http' : 'https');
  return `${scheme}://${handle}.${env.STORE_BASE_DOMAIN}`;
}

// O link vale para o ambiente em que a API está rodando, não para o que foi gravado quando a loja
// nasceu: lojas criadas com outro domínio base passam a devolver o link certo sem migração.
export function withCatalogLink<T extends { handle: string; catalogLink: string }>(store: T): T {
  return { ...store, catalogLink: buildCatalogLink(store.handle) };
}
