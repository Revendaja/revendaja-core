import { request } from './http';
import type { StoreInfo, StoreSettings, StoreSettingsChanges, StoreStats } from './types';

// O usuário informa só o nome: o handle e o link da vitrine são gerados pelo backend.
export function createStore(storeName: string) {
  return request<StoreInfo>('/store', { method: 'POST', body: { storeName }, auth: true });
}

// O que Minha Loja e Editar Loja podem mudar. Envie só o que mudou (pelo menos um campo).
export type StoreChanges = {
  isOnline?: boolean;
  storeName?: string;
  // Minúsculas, números e hífen (3 a 63). Trocar o link faz o endereço antigo da vitrine parar de funcionar.
  handle?: string;
  // Vazio ou null limpa a descrição (até 280 caracteres).
  bio?: string | null;
  // Estoque mínimo padrão pra cada NOVO produto adicionado. Também atualiza quem já está cadastrado
  // e ainda segue o padrão antigo (não toca em quem já tem um mínimo próprio configurado).
  defaultMinStock?: number;
};

// Devolve a loja atualizada. 409 `HANDLE_UNAVAILABLE` = o link já é de outra loja (ou é reservado).
export function updateStore(changes: StoreChanges) {
  return request<StoreInfo>('/store', { method: 'PATCH', body: changes, auth: true });
}

// Liga/desliga a vitrine (tela Minha Loja). Repetir o mesmo valor é seguro.
export function setStoreOnline(isOnline: boolean) {
  return updateStore({ isOnline });
}

// Visitas (7 dias) e pedidos da vitrine, para a tela Minha Loja.
export function getStoreStats() {
  return request<StoreStats>('/store/stats', { auth: true });
}

// Plano da loja e as configurações da tela Mais.
export function getStoreSettings() {
  return request<StoreSettings>('/store/settings', { auth: true });
}

// Envie só o que mudou (pelo menos um campo). `acceptedPaymentMethods` precisa ter ao menos uma forma de pagamento.
export function updateStoreSettings(changes: StoreSettingsChanges) {
  return request<StoreSettings>('/store/settings', { method: 'PATCH', body: changes, auth: true });
}

// Meta de faturamento mensal, em reais (> 0). Escolhida no início e depois só trocada por outra; repetir é seguro.
export function setMonthlyGoal(monthlyGoal: number) {
  return request<{ monthlyGoal: number }>('/store/goal', { method: 'PUT', body: { monthlyGoal }, auth: true });
}
