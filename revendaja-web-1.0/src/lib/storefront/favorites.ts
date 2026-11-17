import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StorefrontProduct } from '@/lib/api/types';

// Favoritos do cliente, guardados neste aparelho (localStorage), um conjunto por loja. Sem conta e
// sem servidor: o cliente marca o coração e a lista volta na próxima visita. Guarda o produto
// inteiro (como o carrinho) para a lista aparecer sem esperar a rede; o preço é o da hora em que
// ele favoritou.
export const MAX_FAVORITES = 60;

export const favoritesKey = (handle: string) => `revendaja.favorites.${handle}`;

export function readFavorites(handle: string): StorefrontProduct[] {
  try {
    const raw = window.localStorage.getItem(favoritesKey(handle));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is StorefrontProduct => Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string')
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function writeFavorites(handle: string, products: StorefrontProduct[]) {
  try {
    window.localStorage.setItem(favoritesKey(handle), JSON.stringify(products));
  } catch {
    // sem localStorage (modo privado, cota cheia): os favoritos valem só enquanto a página está aberta.
  }
}

export function useFavorites(handle: string) {
  const [favorites, setFavorites] = useState<StorefrontProduct[]>([]);
  // Só grava depois de ler o que estava salvo. É estado (não ref) de propósito: na montagem o efeito de
  // gravar roda com a lista ainda vazia e, se pudesse gravar, apagaria os favoritos salvos (no modo
  // estrito do React, que roda os efeitos duas vezes, a segunda leitura já pegaria a lista apagada).
  const [hydrated, setHydrated] = useState(false);

  // Lê só depois de montar, para o HTML do servidor e o do cliente baterem.
  useEffect(() => {
    setFavorites(readFavorites(handle));
    setHydrated(true);
  }, [handle]);

  useEffect(() => {
    if (hydrated) writeFavorites(handle, favorites);
  }, [favorites, handle, hydrated]);

  const ids = useMemo(() => new Set(favorites.map((product) => product.id)), [favorites]);

  const toggle = useCallback((product: StorefrontProduct) => {
    setFavorites((current) =>
      current.some((item) => item.id === product.id)
        ? current.filter((item) => item.id !== product.id)
        : [product, ...current].slice(0, MAX_FAVORITES),
    );
  }, []);

  return { favorites, ids, toggle, hydrated };
}
