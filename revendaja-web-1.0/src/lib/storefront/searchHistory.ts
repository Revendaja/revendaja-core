import { useCallback, useEffect, useState } from 'react';

// Últimas buscas do cliente, guardadas neste aparelho (localStorage), uma lista por loja. Sem conta e
// sem servidor: a lista aparece quando ele foca a busca e some se ele limpar.
export const MAX_RECENT_SEARCHES = 5;
// Busca muito curta traz quase a loja inteira: não roda (e não vai para o histórico).
export const MIN_SEARCH_LENGTH = 2;

export const searchHistoryKey = (handle: string) => `revendaja.searches.${handle}`;

// Põe `term` no topo da lista: sem repetir (ignora maiúscula/minúscula e espaços) e no máximo 5.
export function addRecentSearch(current: string[], term: string): string[] {
  const clean = term.trim().replace(/\s+/g, ' ');
  if (clean.length < MIN_SEARCH_LENGTH) return current;
  const rest = current.filter((item) => item.toLowerCase() !== clean.toLowerCase());
  return [clean, ...rest].slice(0, MAX_RECENT_SEARCHES);
}

export function readRecentSearches(handle: string): string[] {
  try {
    const raw = window.localStorage.getItem(searchHistoryKey(handle));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is string => typeof item === 'string' && item.trim().length >= MIN_SEARCH_LENGTH)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function writeRecentSearches(handle: string, searches: string[]) {
  try {
    window.localStorage.setItem(searchHistoryKey(handle), JSON.stringify(searches));
  } catch {
    // sem localStorage (modo privado, cota cheia): o histórico vale só enquanto a página está aberta.
  }
}

export function useRecentSearches(handle: string) {
  const [searches, setSearches] = useState<string[]>([]);
  // Só grava depois de ler o que estava salvo (mesmo motivo dos favoritos: não apagar o histórico na montagem).
  const [hydrated, setHydrated] = useState(false);

  // Lê só depois de montar, para o HTML do servidor e o do cliente baterem.
  useEffect(() => {
    setSearches(readRecentSearches(handle));
    setHydrated(true);
  }, [handle]);

  useEffect(() => {
    if (hydrated) writeRecentSearches(handle, searches);
  }, [searches, handle, hydrated]);

  const add = useCallback((term: string) => setSearches((current) => addRecentSearch(current, term)), []);
  const remove = useCallback(
    (term: string) => setSearches((current) => current.filter((item) => item !== term)),
    [],
  );
  const clear = useCallback(() => setSearches([]), []);

  return { searches, add, remove, clear };
}
