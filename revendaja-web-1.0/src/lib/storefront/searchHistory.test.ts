import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRecentSearch,
  MAX_RECENT_SEARCHES,
  readRecentSearches,
  searchHistoryKey,
  useRecentSearches,
} from './searchHistory';

describe('histórico de buscas (neste aparelho)', () => {
  beforeEach(() => window.localStorage.clear());

  it('a busca mais nova vai para o topo, sem repetir (ignora maiúscula e espaços)', () => {
    let list: string[] = [];
    list = addRecentSearch(list, 'kaiak');
    list = addRecentSearch(list, 'malbec');
    list = addRecentSearch(list, '  KAIAK  ');

    expect(list).toEqual(['KAIAK', 'malbec']);
  });

  it('guarda só as 5 mais recentes', () => {
    let list: string[] = [];
    for (const term of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7']) list = addRecentSearch(list, term);

    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list).toEqual(['g7', 'f6', 'e5', 'd4', 'c3']);
  });

  it('busca curta demais (menos de 2 letras) não entra', () => {
    expect(addRecentSearch(['kaiak'], ' a ')).toEqual(['kaiak']);
  });

  it('lê vazio quando não há nada salvo ou o conteúdo está ilegível', () => {
    expect(readRecentSearches('loja')).toEqual([]);
    window.localStorage.setItem(searchHistoryKey('loja'), '{quebrado');
    expect(readRecentSearches('loja')).toEqual([]);
    window.localStorage.setItem(searchHistoryKey('loja'), JSON.stringify([1, 'x', 'kaiak', null]));
    expect(readRecentSearches('loja')).toEqual(['kaiak']);
  });

  it('adicionar, remover e limpar grava na loja certa e volta na próxima visita', () => {
    const { result, unmount } = renderHook(() => useRecentSearches('loja-a'));

    act(() => result.current.add('kaiak'));
    act(() => result.current.add('malbec'));
    expect(result.current.searches).toEqual(['malbec', 'kaiak']);

    act(() => result.current.remove('kaiak'));
    expect(result.current.searches).toEqual(['malbec']);
    unmount();

    expect(readRecentSearches('loja-a')).toEqual(['malbec']);
    expect(readRecentSearches('loja-b')).toEqual([]);

    const again = renderHook(() => useRecentSearches('loja-a'));
    expect(again.result.current.searches).toEqual(['malbec']);
    act(() => again.result.current.clear());
    expect(again.result.current.searches).toEqual([]);
  });

  it('no modo estrito do React não apaga o histórico salvo ao montar', () => {
    window.localStorage.setItem(searchHistoryKey('loja'), JSON.stringify(['kaiak']));

    const { result } = renderHook(() => useRecentSearches('loja'), { wrapper: StrictMode });

    expect(result.current.searches).toEqual(['kaiak']);
    expect(readRecentSearches('loja')).toEqual(['kaiak']);
  });
});
