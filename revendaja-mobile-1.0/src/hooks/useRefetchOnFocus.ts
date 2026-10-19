import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

// Revalida uma query ao ganhar foco (trocar de aba, voltar de outra tela) — SÓ se o dado já passou
// do `staleTime` dela. As telas de aba nunca desmontam ao trocar de aba, então o refetch automático
// que o `useQuery` já faz sozinho ao MONTAR nunca dispara de novo sozinho; isso supre essa lacuna.
//
// Importante: `invalidateQueries` NÃO serve pra isso — ele força a busca de nova sempre, ignorando o
// staleTime (é pra isso que existe). Por isso aqui checa `query.isStale()` na mão antes de decidir
// se busca de novo, senão toda troca de aba dispararia uma requisição e piscaria o indicador de
// "atualizando" na tela, mesmo com dado fresquinho de segundos atrás.
export function useRefetchOnFocus(queryKey: QueryKey) {
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      const queries = queryClient.getQueryCache().findAll({ queryKey, type: 'active' });
      const isStale = queries.length === 0 || queries.some((query) => query.isStale());
      if (isStale) {
        void queryClient.refetchQueries({ queryKey, type: 'active' });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, JSON.stringify(queryKey)])
  );
}
