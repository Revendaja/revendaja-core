import { useCallback } from 'react';
import { isApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';

const NO_STORE_MESSAGE = /n[ãa]o possui uma loja/i;

// Rotas que exigem e-mail verificado + loja criada (/store/products, /sales...). Envolva a chamada:
// 403 "Confirme seu e-mail..." → tela do código. 404 "Você ainda não possui uma loja." → tela de criar loja.
// (O 404 "Produto não encontrado..." é outra coisa e segue como erro normal.) O 401 é do cliente HTTP central.
export function useStoreAccessGuard() {
  const { markUnverified, clearStore } = useAuth();

  return useCallback(
    async <T,>(call: () => Promise<T>): Promise<T> => {
      try {
        return await call();
      } catch (error) {
        if (isApiError(error)) {
          if (error.status === 403) markUnverified();
          else if (error.status === 404 && NO_STORE_MESSAGE.test(error.message)) clearStore();
        }
        throw error;
      }
    },
    [markUnverified, clearStore]
  );
}
