import { QueryClient } from '@tanstack/react-query';

// Fábrica (não singleton de módulo): cada aba/sessão de navegador cria sua própria instância dentro
// do AppProviders, para o estado de uma pessoa nunca vazar para outra numa renderização no servidor.
// `staleTime` de 30s: uma tela que reabre (troca de aba, volta da navegação) com dado de menos de
// 30s não busca de novo. `retry: 1` porque a API já devolve mensagem pronta em pt-BR pra cada erro
// (rede, 401, validação...): tentar de novo sozinho só atrasa mostrar isso.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });
}
