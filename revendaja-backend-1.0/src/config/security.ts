// Regras de acesso pelo navegador: de quais sites a API aceita chamadas (CORS) e se a documentação
// interativa (/docs) fica pública. Funções puras, para testar sem subir o servidor.

export interface CorsConfig {
  nodeEnv: string;
  // Domínio das vitrines: {handle}.STORE_BASE_DOMAIN (pode ter porta em desenvolvimento).
  storeBaseDomain: string;
  // Endereço do painel web.
  webAppUrl: string;
  // Origens extras permitidas (lista separada por vírgula em CORS_ORIGINS).
  extraOrigins: string[];
}

function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CORS é uma regra do NAVEGADOR (ele bloqueia a leitura da resposta); não impede ninguém de chamar a
// API por fora (curl, script, outro servidor) — quem protege os dados é a autenticação. Por isso o app
// do celular, que não usa navegador, nunca é afetado: ele não manda o cabeçalho `Origin`.
export function buildOriginMatcher(config: CorsConfig): (origin: string | undefined) => boolean {
  const production = config.nodeEnv === 'production';
  const base = config.storeBaseDomain.trim().toLowerCase();

  const exact = new Set<string>();
  try {
    exact.add(new URL(config.webAppUrl).origin.toLowerCase());
  } catch {
    // WEB_APP_URL inválida: o env já a valida; aqui só não adiciona nada.
  }
  exact.add(`https://${base}`);
  if (!production) exact.add(`http://${base}`);
  if (!base.startsWith('www.') && !base.includes('localhost')) exact.add(`https://www.${base}`);
  for (const extra of config.extraOrigins) {
    if (extra.trim()) exact.add(normalize(extra));
  }

  // Vitrines e painel em subdomínios do domínio base: https://{handle}.revendaja.com
  const subdomain = new RegExp(
    `^${production ? 'https' : 'https?'}://[a-z0-9-]+\\.${escapeRegex(base)}$`,
  );
  // Só fora de produção: telas abertas na máquina de quem desenvolve.
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  return (origin) => {
    // Sem cabeçalho Origin: app do celular, servidor para servidor, curl. Não é CORS.
    if (!origin) return true;
    const normalized = normalize(origin);
    if (exact.has(normalized)) return true;
    if (subdomain.test(normalized)) return true;
    return !production && local.test(normalized);
  };
}

// A documentação interativa lista todas as rotas e parâmetros da API: em produção fica desligada, a
// menos que a administradora ligue de propósito com API_DOCS_ENABLED=true (e depois desligue).
export function apiDocsEnabled(nodeEnv: string, flag: 'true' | 'false' | undefined): boolean {
  if (nodeEnv === 'test') return false;
  if (flag !== undefined) return flag === 'true';
  return nodeEnv !== 'production';
}
