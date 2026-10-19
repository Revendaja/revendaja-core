import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type Tokens = {
  accessToken: string;
  refreshToken: string;
};

const ACCESS_KEY = 'revendaja.accessToken';
const REFRESH_KEY = 'revendaja.refreshToken';

// Tokens só em storage seguro: Keychain (iOS) / Keystore (Android) via expo-secure-store.
// Na web o SecureStore não existe e localStorage não é seguro, então lá os tokens ficam apenas
// em memória (a sessão não sobrevive a recarregar a página). Nunca AsyncStorage/localStorage.
const persistent = Platform.OS !== 'web';

async function readItem(key: string): Promise<string | null> {
  if (!persistent) return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeItem(key: string, value: string): Promise<void> {
  if (persistent) await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (!persistent) return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Apagar é best-effort: o cache em memória já foi limpo.
  }
}

// Cache em memória: evita ler o keychain a cada request e deixa o clear() valer na hora.
let cache: Tokens | null | undefined;

export const tokenStorage = {
  // Leitura síncrona do cache: undefined = ainda não carregado, null = sem sessão.
  peek(): Tokens | null | undefined {
    return cache;
  },

  async load(): Promise<Tokens | null> {
    if (cache !== undefined) return cache;
    const [accessToken, refreshToken] = await Promise.all([readItem(ACCESS_KEY), readItem(REFRESH_KEY)]);
    cache = accessToken && refreshToken ? { accessToken, refreshToken } : null;
    return cache;
  },

  async save(tokens: Tokens): Promise<void> {
    cache = tokens;
    await Promise.all([writeItem(ACCESS_KEY, tokens.accessToken), writeItem(REFRESH_KEY, tokens.refreshToken)]);
  },

  // O refreshToken não é rotacionado: a renovação troca só o accessToken.
  async setAccessToken(accessToken: string): Promise<void> {
    const current = await tokenStorage.load();
    if (!current) return;
    cache = { ...current, accessToken };
    await writeItem(ACCESS_KEY, accessToken);
  },

  async clear(): Promise<void> {
    cache = null;
    await Promise.all([removeItem(ACCESS_KEY), removeItem(REFRESH_KEY)]);
  },
};
