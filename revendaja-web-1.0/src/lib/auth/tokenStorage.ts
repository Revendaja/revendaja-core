export type Tokens = {
  accessToken: string;
  refreshToken: string;
};

// Só o refreshToken é persistido (localStorage) para a sessão sobreviver a um F5. O accessToken
// (curta duração, 15 min) vive só em memória e é renovado na hora quando falta — guardar os dois em
// localStorage exporia ambos a qualquer script injetado por XSS sem ganho real de segurança.
const REFRESH_KEY = 'revendaja.refreshToken';

function readStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeStoredRefreshToken(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(REFRESH_KEY);
    else window.localStorage.setItem(REFRESH_KEY, value);
  } catch {
    // localStorage indisponível (modo privado, cota cheia): a aba atual segue funcionando, só não
    // sobrevive a um reload.
  }
}

// undefined = ainda não inicializado nesta carga de página, null = sem sessão.
let state: Tokens | null | undefined;

export const tokenStorage = {
  // Leitura síncrona do estado em memória.
  peek(): Tokens | null | undefined {
    return state;
  },

  async load(): Promise<Tokens | null> {
    return state ?? null;
  },

  // Chamado uma vez no boot do app (AuthContext#bootstrap): lê o refreshToken salvo e devolve para
  // quem chamou disparar a renovação do accessToken. Sem refreshToken salvo, não há sessão.
  bootFromStorage(): string | null {
    const refreshToken = readStoredRefreshToken();
    state = refreshToken ? { accessToken: '', refreshToken } : null;
    return refreshToken;
  },

  async save(tokens: Tokens): Promise<void> {
    state = tokens;
    writeStoredRefreshToken(tokens.refreshToken);
  },

  // O refreshToken não é rotacionado: a renovação troca só o accessToken.
  async setAccessToken(accessToken: string): Promise<void> {
    if (!state) return;
    state = { ...state, accessToken };
  },

  async clear(): Promise<void> {
    state = null;
    writeStoredRefreshToken(null);
  },
};
