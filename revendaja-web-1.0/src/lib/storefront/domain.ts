// Domínio base das vitrines: {handle}.STORE_BASE_DOMAIN.
// - Desenvolvimento (`next dev`): localhost:3001 → http://vianastore.localhost:3001
// - Produção (`next build`/`start`): revendaja.com → https://vianastore.revendaja.com
// `NEXT_PUBLIC_STORE_BASE_DOMAIN` força outro valor (ex.: testar o build de produção em localhost:3001).
// Usado no navegador e no proxy: só pode depender de variáveis NEXT_PUBLIC_* (inlinadas no build).
export const STORE_BASE_DOMAIN =
  process.env.NEXT_PUBLIC_STORE_BASE_DOMAIN || (process.env.NODE_ENV === 'production' ? 'revendaja.com' : 'localhost:3001');

const LOCAL_DOMAIN = /^localhost(:\d+)?$/i;

export const isLocalStoreDomain = LOCAL_DOMAIN.test(STORE_BASE_DOMAIN);

// Subdomínios da própria plataforma: nunca são vitrine (a API também os reserva ao criar a loja).
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'web', 'admin', 'painel', 'dashboard', 'mail', 'email', 'ftp', 'static',
  'assets', 'cdn', 'docs', 'blog', 'help', 'ajuda', 'suporte', 'support', 'status', 'login',
  'cadastro', 'loja', 'lojas', 'store', 'revendaja',
]); // prettier-ignore

// "vianastore.localhost:3001" → "vianastore". Devolve null quando o host é o do próprio app
// (localhost, revendaja.com, app.revendaja.com...) e não de uma vitrine.
export function storeHandleFromHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.toLowerCase().replace(/:\d+$/, '');
  const base = STORE_BASE_DOMAIN.toLowerCase().replace(/:\d+$/, '');
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const handle = host.slice(0, -suffix.length);
  // Só um nível ("a.b.revendaja.com" não é loja) e fora dos reservados.
  if (!handle || handle.includes('.') || RESERVED_SUBDOMAINS.has(handle)) return null;
  return handle;
}

// Link público da vitrine, no ambiente em que o app está rodando.
export function storeUrl(handle: string): string {
  return `${isLocalStoreDomain ? 'http' : 'https'}://${handle}.${STORE_BASE_DOMAIN}`;
}
