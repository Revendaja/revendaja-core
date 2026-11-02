import type { FulfillmentMethod, NewSalePaymentMethod } from '@/lib/api/types';

// Dados do cliente guardados neste aparelho depois do primeiro pedido, para ele não digitar tudo de
// novo. Fica só no localStorage do navegador (nunca vai para o servidor por conta própria) e a
// vitrine de cada loja tem o seu (cada subdomínio é uma origem separada). O troco NÃO é guardado:
// vale só para aquele pedido.
const CUSTOMER_KEY = 'revendaja.customer';
const CEP_KEY = 'revendaja.cep';

export type SavedCustomer = {
  name: string;
  whatsapp: string;
  fulfillment: FulfillmentMethod;
  address: string;
  paymentMethod: NewSalePaymentMethod;
};

export function readSavedCustomer(): SavedCustomer | null {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedCustomer>;
    if (typeof data.name !== 'string' || typeof data.whatsapp !== 'string') return null;
    return {
      name: data.name,
      whatsapp: data.whatsapp,
      fulfillment: data.fulfillment === 'delivery' ? 'delivery' : 'pickup',
      address: typeof data.address === 'string' ? data.address : '',
      paymentMethod: data.paymentMethod === 'card' || data.paymentMethod === 'cash' ? data.paymentMethod : 'pix',
    };
  } catch {
    return null;
  }
}

export function writeSavedCustomer(customer: SavedCustomer | null) {
  try {
    if (customer) window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
    else window.localStorage.removeItem(CUSTOMER_KEY);
  } catch {
    // localStorage indisponível (modo privado, cota cheia): o pedido segue normal, só não lembra dos dados.
  }
}

// Primeiro nome para a saudação ("Bem-vindo, Maria"). Sem nome salvo é visitante.
export function greetingName(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : 'Visitante';
}

// --- CEP ------------------------------------------------------------------------------------

export type VisitorCep = {
  // Só os 8 dígitos.
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
};

export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function isValidCep(value: string): boolean {
  return /^\d{8}$/.test(value.replace(/\D/g, ''));
}

// "Cidade/UF" (vazio quando a consulta não trouxe cidade).
export function cepPlace(cep: VisitorCep): string {
  return [cep.city, cep.state].filter(Boolean).join('/');
}

// Ponto de partida do endereço de entrega (o cliente completa com número e complemento).
export function addressFromCep(cep: VisitorCep): string {
  const parts = [cep.street, cep.district, [cep.city, cep.state].filter(Boolean).join(' - ')].filter(Boolean);
  return `${parts.join(', ')}${parts.length ? ', ' : ''}CEP ${maskCep(cep.cep)}`;
}

export class CepNotFoundError extends Error {}

// ViaCEP (público, sem chave). Rejeita com CepNotFoundError quando o CEP não existe.
export async function lookupCep(value: string, signal?: AbortSignal): Promise<VisitorCep> {
  const digits = value.replace(/\D/g, '');
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal });
  if (!response.ok) throw new Error('Não foi possível consultar o CEP agora.');
  const data = (await response.json()) as {
    erro?: boolean | string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (data.erro) throw new CepNotFoundError('CEP não encontrado.');
  return {
    cep: digits,
    street: data.logradouro ?? '',
    district: data.bairro ?? '',
    city: data.localidade ?? '',
    state: data.uf ?? '',
  };
}

export function readSavedCep(): VisitorCep | null {
  try {
    const raw = window.localStorage.getItem(CEP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<VisitorCep>;
    if (typeof data.cep !== 'string' || !isValidCep(data.cep)) return null;
    return {
      cep: data.cep,
      street: typeof data.street === 'string' ? data.street : '',
      district: typeof data.district === 'string' ? data.district : '',
      city: typeof data.city === 'string' ? data.city : '',
      state: typeof data.state === 'string' ? data.state : '',
    };
  } catch {
    return null;
  }
}

export function writeSavedCep(cep: VisitorCep | null) {
  try {
    if (cep) window.localStorage.setItem(CEP_KEY, JSON.stringify(cep));
    else window.localStorage.removeItem(CEP_KEY);
  } catch {
    // sem localStorage: o CEP vale só enquanto a página está aberta.
  }
}
