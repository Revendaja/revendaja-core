import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorefrontProduct } from '@/lib/api/types';
import { favoritesKey, MAX_FAVORITES, readFavorites, useFavorites } from './favorites';

const product = (id: string) => ({ id, name: `Produto ${id}` }) as StorefrontProduct;

describe('favoritos do cliente (neste aparelho)', () => {
  beforeEach(() => window.localStorage.clear());

  it('lê vazio quando não há nada salvo ou o conteúdo está ilegível', () => {
    expect(readFavorites('loja')).toEqual([]);
    window.localStorage.setItem(favoritesKey('loja'), '{quebrado');
    expect(readFavorites('loja')).toEqual([]);
    window.localStorage.setItem(favoritesKey('loja'), JSON.stringify([{ id: 1 }, product('a')]));
    expect(readFavorites('loja').map((item) => item.id)).toEqual(['a']);
  });

  it('favoritar e desfavoritar grava na loja certa e volta na próxima visita', () => {
    const { result, unmount } = renderHook(() => useFavorites('loja-a'));

    act(() => result.current.toggle(product('1')));
    act(() => result.current.toggle(product('2')));
    expect(result.current.favorites.map((item) => item.id)).toEqual(['2', '1']);
    expect(result.current.ids.has('1')).toBe(true);

    act(() => result.current.toggle(product('1')));
    expect(result.current.ids.has('1')).toBe(false);
    unmount();

    // Próxima visita: a lista volta sozinha; outra loja não vê.
    const again = renderHook(() => useFavorites('loja-a'));
    expect(again.result.current.favorites.map((item) => item.id)).toEqual(['2']);
    const other = renderHook(() => useFavorites('loja-b'));
    expect(other.result.current.favorites).toEqual([]);
  });

  it('respeita o limite de favoritos', () => {
    const { result } = renderHook(() => useFavorites('loja'));
    for (let index = 0; index < MAX_FAVORITES + 5; index += 1) act(() => result.current.toggle(product(String(index))));
    expect(result.current.favorites).toHaveLength(MAX_FAVORITES);
  });
});

describe('recarregar a página (inclui o modo estrito do React em desenvolvimento)', () => {
  it('não apaga os favoritos salvos ao montar', () => {
    window.localStorage.setItem(favoritesKey('loja'), JSON.stringify([product('1'), product('2')]));

    const { result } = renderHook(() => useFavorites('loja'), { wrapper: StrictMode });

    expect(result.current.favorites.map((item) => item.id)).toEqual(['1', '2']);
    expect(readFavorites('loja').map((item) => item.id)).toEqual(['1', '2']);
  });
});
