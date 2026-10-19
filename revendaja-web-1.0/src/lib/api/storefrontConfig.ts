import { request } from './http';
import { uploadImage } from './storeProducts';
import type { StorefrontConfig, StorefrontCustomization } from './types';

// Aparência da vitrine (painel). Cada seção é independente.
export function getStorefrontCustomization() {
  return request<StorefrontCustomization>('/store/storefront', { auth: true });
}

// Só as seções enviadas mudam: objeto = personalizar; `null` = voltar ao padrão.
export type StorefrontConfigChanges = { [K in keyof StorefrontConfig]?: StorefrontConfig[K] | null };

export function updateStorefrontCustomization(changes: StorefrontConfigChanges) {
  return request<StorefrontCustomization>('/store/storefront', { method: 'PUT', body: changes, auth: true });
}

// Imagem de banner (topo, ofertas ou coleção): sobe para o nosso bucket e devolve a URL.
export function uploadBannerImage(file: File) {
  return uploadImage('/uploads/store-banner', file);
}
