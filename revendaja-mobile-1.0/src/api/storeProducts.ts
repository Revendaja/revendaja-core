import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from './config';
import { ApiError, NetworkError } from './errors';
import { getFreshAccessToken, request } from './http';
import { buildQuery } from './query';
import type { Paginated, StoreProduct } from './types';

export const STORE_PRODUCTS_PAGE_SIZE = 20;

export type StoreProductSort = 'recent' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc';

// Do mais recente para o mais antigo (por data de adição), a menos que `options.sort` diga outra ordem.
// `search` busca por nome e, se for só dígitos (8 a 14), também por código de barras. Nunca envia
// `search` vazio (a API responde 400). `options.categoryId` filtra por uma categoria própria da loja.
export function listStoreProducts(
  page = 1,
  pageSize = STORE_PRODUCTS_PAGE_SIZE,
  search?: string,
  options?: { sort?: StoreProductSort; categoryId?: string }
) {
  const trimmed = search?.trim();
  const query = buildQuery({
    search: trimmed ? trimmed : undefined,
    page,
    pageSize,
    sort: options?.sort && options.sort !== 'recent' ? options.sort : undefined,
    categoryId: options?.categoryId,
  });
  return request<Paginated<StoreProduct>>(`/store/products${query}`, { auth: true });
}

// `productId` é o id numérico do produto do catálogo. `price` e `costPrice` em reais (número, não string).
// `costPrice` é opcional: ausente ou null = "não informado" (0 é um custo válido). `stock` é inteiro de 0 a 1.000.000.
export function addStoreProduct(input: { productId: number; price: number; stock: number; costPrice?: number | null }) {
  return request<StoreProduct>('/store/products', { method: 'POST', body: input, auth: true });
}

// `id` é o UUID do StoreProduct. Envie só o que mudou, mas pelo menos um dos campos.
// `stock` é o valor ABSOLUTO (0 = esgotado). `costPrice: null` limpa o custo.
// `name/description/image/components` só valem num produto manual (a API recusa num do catálogo).
export type StoreProductChanges = {
  price?: number;
  costPrice?: number | null;
  stock?: number;
  isActive?: boolean;
  // null tira o produto da categoria; ausente não mexe nela.
  categoryId?: string | null;
  // Os dois sempre juntos: os dois nulos remove a promoção, os dois preenchidos define uma nova.
  promoPrice?: number | null;
  promoEndsAt?: string | null;
  name?: string;
  description?: string | null;
  image?: string | null;
  // Enviado (mesmo vazio) SUBSTITUI a lista inteira de componentes do kit.
  components?: ManualStoreProductComponentInput[];
};

export function updateStoreProduct(id: string, changes: StoreProductChanges) {
  return request<StoreProduct>(`/store/products/${id}`, { method: 'PATCH', body: changes, auth: true });
}

// Resposta sem corpo: o cliente HTTP aceita corpo vazio (não tenta ler JSON).
export function deleteStoreProduct(id: string) {
  return request<null>(`/store/products/${id}`, { method: 'DELETE', auth: true });
}

// --- Produto manual (fora do catálogo, ex.: um ursinho ou uma cesta de presente) ----------------

export type ManualStoreProductComponentInput = { storeProductId: string; quantity: number };

export type CreateManualStoreProductInput = {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  costPrice?: number | null;
  stock: number;
  // Ausente = produto simples (sem kit). Presente (mesmo vazio) define a composição do kit.
  components?: ManualStoreProductComponentInput[];
};

export function addManualStoreProduct(input: CreateManualStoreProductInput) {
  return request<StoreProduct>('/store/products/manual', { method: 'POST', body: input, auth: true });
}

// Sobe a imagem do produto manual pro S3 e devolve a URL pública. `uri` é o caminho local do
// arquivo (ex.: devolvido pelo `expo-image-picker`); `mimeType` decide a extensão salva no bucket.
//
// Não usa `request()`/`fetch` (como o resto da API): o fetch do Expo (`expo/winter`, SDK 57) não
// aceita nem o atalho clássico do React Native de arquivo em FormData (`{ uri, name, type }`) nem
// um `Blob` construído à mão em JS — só um `Blob` nativo de verdade (`expo-blob`) ou um `File` web,
// nenhum dos dois disponível aqui. `expo-file-system` faz o upload inteiro no nível nativo, sem
// passar por essa limitação: por isso monta o header de autenticação à mão.
export async function uploadProductImage(uri: string, mimeType: string): Promise<{ url: string }> {
  const token = await getFreshAccessToken();

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync(`${API_URL}/uploads/product-image`, uri, {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'image',
      mimeType,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new NetworkError();
  }

  let data: unknown = null;
  if (result.body) {
    try {
      data = JSON.parse(result.body);
    } catch {
      data = null;
    }
  }

  if (result.status < 200 || result.status >= 300) {
    const body = (data ?? {}) as { error?: unknown; message?: unknown };
    const code = typeof body.error === 'string' ? body.error : 'UNKNOWN_ERROR';
    const fallback =
      result.status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Não foi possível enviar a imagem.';
    const message = typeof body.message === 'string' && body.message ? body.message : fallback;
    throw new ApiError(result.status, code, message);
  }

  return data as { url: string };
}
