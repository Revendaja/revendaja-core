import { useSyncExternalStore } from 'react';

// Alertas do navegador: no mobile as notificações chegam por push (token Expo registrado no backend).
// O backend só envia para tokens Expo, então na web o equivalente é avisar pelo próprio navegador
// (Notification API) quando chega uma notificação nova enquanto o painel está aberto. A preferência
// fica só neste navegador.
const PREF_KEY = 'revendaja:browser-alerts';
const CHANGE_EVENT = 'revendaja:browser-alerts-change';

export type BrowserAlertsPermission = NotificationPermission | 'unsupported';

function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function readPref() {
  try {
    return window.localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function readPermission(): BrowserAlertsPermission {
  return isSupported() ? Notification.permission : 'unsupported';
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function emitChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Liga os alertas: pede a permissão ao navegador (popup) se ainda não foi decidida. Só fica ligado
// se a permissão for concedida. Devolve a permissão final.
export async function enableBrowserAlerts(): Promise<BrowserAlertsPermission> {
  if (!isSupported()) return 'unsupported';
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  try {
    window.localStorage.setItem(PREF_KEY, permission === 'granted' ? '1' : '0');
  } catch {
    // Sem armazenamento: os alertas valem só até recarregar a página.
  }
  emitChange();
  return permission;
}

export function disableBrowserAlerts() {
  try {
    window.localStorage.setItem(PREF_KEY, '0');
  } catch {
    // Ver acima.
  }
  emitChange();
}

export function useBrowserAlerts() {
  const permission = useSyncExternalStore<BrowserAlertsPermission>(subscribe, readPermission, () => 'unsupported');
  const preferred = useSyncExternalStore(subscribe, readPref, () => false);
  return {
    permission,
    supported: permission !== 'unsupported',
    // Ligado de verdade = o usuário quer E o navegador permite (a permissão pode ser revogada por fora).
    enabled: preferred && permission === 'granted',
  };
}
