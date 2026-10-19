import * as Crypto from 'expo-crypto';

// UUID v4 (aleatório seguro) para o clientRequestId da venda.
export function newRequestId(): string {
  return Crypto.randomUUID();
}
