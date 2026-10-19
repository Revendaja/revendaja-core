import { ApiError } from '../api/errors';

// O servidor é idempotente por `clientRequestId`: repetir o mesmo id devolve a MESMA venda (200) sem baixar o
// estoque de novo. Por isso o id precisa acompanhar a tentativa:
//  - mesma venda, nova tentativa (timeout, queda de rede, duplo clique) → reutiliza o mesmo id;
//  - carrinho/pagamento/nome mudou → id novo (senão o servidor devolveria a venda antiga, com os dados velhos);
//  - sucesso (201 ou 200) → descarta o id; a próxima venda é outra;
//  - erro definitivo (400/404/409) → o usuário vai ajustar o carrinho: id novo ao reenviar.
export function createSaleAttemptTracker(generateId: () => string) {
  let current: { id: string; key: string } | null = null;

  return {
    // `key` descreve o conteúdo da venda (cliente, pagamento, itens).
    idFor(key: string): string {
      if (!current || current.key !== key) current = { id: generateId(), key };
      return current.id;
    },
    // Chame depois de sucesso ou de uma rejeição definitiva do servidor.
    reset() {
      current = null;
    },
  };
}

// 4xx = o servidor recusou a venda (nada foi gravado): não reaproveite o id. Rede/timeout/5xx = não sabemos se
// gravou: reaproveite o mesmo id na nova tentativa.
export function isDefinitiveRejection(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

// Chave estável do conteúdo da venda (a ordem dos itens não importa).
export function saleContentKey(input: {
  customerName: string;
  paymentMethod: string;
  installments?: number;
  items: { storeProductId: string; quantity: number }[];
}): string {
  const items = [...input.items]
    .sort((a, b) => (a.storeProductId < b.storeProductId ? -1 : 1))
    .map((item) => `${item.storeProductId}:${item.quantity}`);
  return JSON.stringify([input.customerName, input.paymentMethod, input.installments ?? null, items]);
}
