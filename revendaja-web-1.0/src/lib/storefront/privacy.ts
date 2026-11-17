import { writeSavedCep, writeSavedCustomer } from './visitor';
import { favoritesKey } from './favorites';

// O que a vitrine guarda NO APARELHO do cliente (localStorage/sessionStorage) e o aviso sobre isso.
// Nada daqui vai para o servidor por conta própria; a política de privacidade lista cada item.

export const cartStorageKey = (handle: string) => `revendaja.cart.${handle}`;

const NOTICE_KEY = 'revendaja.privacy-notice';

export function hasSeenPrivacyNotice(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    // Sem localStorage não dá para lembrar: mostra o aviso (ele só some até recarregar).
    return false;
  }
}

export function markPrivacyNoticeSeen() {
  try {
    window.localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    // ignorado: o aviso volta na próxima visita.
  }
}

// Apaga carrinho, favoritos, dados do último pedido e CEP desta loja neste aparelho.
export function clearLocalData(handle: string) {
  writeSavedCustomer(null);
  writeSavedCep(null);
  try {
    window.localStorage.removeItem(cartStorageKey(handle));
    window.localStorage.removeItem(favoritesKey(handle));
  } catch {
    // localStorage indisponível: não há nada guardado para apagar.
  }
}
