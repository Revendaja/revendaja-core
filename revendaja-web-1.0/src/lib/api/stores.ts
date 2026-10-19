import { request } from './http';
import type { StoreInfo, StorePlanUsage, StoreSettings, StoreSettingsChanges, StoreStats } from './types';

// O usuário informa só o nome: o handle e o link da vitrine são gerados pelo backend.
export function createStore(storeName: string) {
  return request<StoreInfo>('/store', { method: 'POST', body: { storeName }, auth: true });
}

// Meta de faturamento mensal, em reais (> 0). Escolhida no início e depois só trocada por outra; repetir é seguro.
export function setMonthlyGoal(monthlyGoal: number) {
  return request<{ monthlyGoal: number }>('/store/goal', { method: 'PUT', body: { monthlyGoal }, auth: true });
}

// Plano da loja com os limites e o uso atual (produtos cadastrados).
export function getStorePlan() {
  return request<StorePlanUsage>('/store/plan', { auth: true });
}

// Liga/desliga a vitrine. Devolve a loja atualizada; repetir o mesmo valor é seguro.
export function setStoreOnline(isOnline: boolean) {
  return request<StoreInfo>('/store', { method: 'PATCH', body: { isOnline }, auth: true });
}

// Visitas (7 dias) e pedidos da vitrine.
export function getStoreStats() {
  return request<StoreStats>('/store/stats', { auth: true });
}

// O que Editar loja pode mudar. Envie só o que mudou (pelo menos um campo).
export type StoreChanges = {
  isOnline?: boolean;
  storeName?: string;
  // Minúsculas e números (3 a 63). Trocar o link faz o endereço antigo da vitrine parar de funcionar.
  handle?: string;
  // Vazio ou null limpa a descrição (até 280 caracteres).
  bio?: string | null;
  // Estoque mínimo padrão pra cada NOVO produto adicionado. 0 = desligado.
  defaultMinStock?: number;
};

// Devolve a loja atualizada. 409 `HANDLE_UNAVAILABLE` = o link já é de outra loja (ou é reservado).
export function updateStore(changes: StoreChanges) {
  return request<StoreInfo>('/store', { method: 'PATCH', body: changes, auth: true });
}

// Formas de pagamento aceitas na vitrine e se produtos sem estoque ficam escondidos.
export function getStoreSettings() {
  return request<StoreSettings>('/store/settings', { auth: true });
}

// Envie só o que mudou. `acceptedPaymentMethods` precisa ter ao menos uma forma de pagamento.
export function updateStoreSettings(changes: StoreSettingsChanges) {
  return request<StoreSettings>('/store/settings', { method: 'PATCH', body: changes, auth: true });
}
