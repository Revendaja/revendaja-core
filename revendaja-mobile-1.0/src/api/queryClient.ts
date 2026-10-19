import { QueryClient } from '@tanstack/react-query';

// `staleTime` de 30s: uma tela que reabre (troca de aba, volta de outra tela) com dado de menos de
// 30s não busca de novo — só mostra o que já tem. `retry: 1` porque a API já devolve mensagem pronta
// em pt-BR pra cada erro (rede, 401, validação...): tentar de novo sozinho só atrasa mostrar isso; o
// "Tentar novamente" de cada tela continua sendo o mecanismo real de nova tentativa.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Não existe "foco de janela" no app: cada tela decide quando revalidar (ver useRefetchOnFocus).
      refetchOnWindowFocus: false,
    },
  },
});
