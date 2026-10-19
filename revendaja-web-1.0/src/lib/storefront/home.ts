import type { CollectionLink, StorefrontCategory, StorefrontHome, StorefrontProduct } from '@/lib/api/types';
import type { StorefrontFilter } from '@/lib/api/public';

// Ids das seções da página (âncoras do menu e dos botões).
export const SECTION_IDS = {
  top: 'inicio',
  categories: 'categorias',
  featured: 'destaques',
  offers: 'ofertas',
  newArrivals: 'novidades',
  catalog: 'produtos',
} as const;

// Percentual de desconto de uma promoção que ainda vale (0 = sem promoção).
export function discountPercent(product: StorefrontProduct): number {
  if (!product.isPromoActive || product.promoPrice === null || product.price <= 0) return 0;
  const percent = Math.round((1 - product.promoPrice / product.price) * 100);
  return percent > 0 ? percent : 0;
}

// Maior desconto entre os produtos (para o selo "ATÉ X% OFF"). 0 = nenhum.
export function maxDiscount(products: StorefrontProduct[]): number {
  return products.reduce((max, product) => Math.max(max, discountPercent(product)), 0);
}

export function productImage(product: StorefrontProduct): string | null {
  return product.image ?? product.imageSm;
}

// Fotos distintas dos produtos para montar a arte padrão dos banners (sem repetir a mesma foto).
export function pickImages(products: StorefrontProduct[], limit: number): string[] {
  const seen = new Set<string>();
  for (const product of products) {
    const url = productImage(product);
    if (url && !seen.has(url)) seen.add(url);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

// Para onde um link de coleção leva: rolar até uma seção ou filtrar por categoria/marca.
export type LinkTarget = { kind: 'scroll'; id: string } | { kind: 'filter'; filter: NonNullable<StorefrontFilter> };

export function resolveLink(link: CollectionLink): LinkTarget {
  if (link.type === 'category') return { kind: 'filter', filter: { type: 'category', id: link.id } };
  if (link.type === 'brand') return { kind: 'filter', filter: { type: 'brand', id: String(link.id) } };
  const ids = {
    featured: SECTION_IDS.featured,
    offers: SECTION_IDS.offers,
    new: SECTION_IDS.newArrivals,
    catalog: SECTION_IDS.catalog,
  } as const;
  return { kind: 'scroll', id: ids[link.section] };
}

// Produtos que ilustram uma coleção (a arte padrão usa as fotos deles).
export function collectionProducts(link: CollectionLink, home: StorefrontHome): StorefrontProduct[] {
  if (link.type !== 'section') return [];
  if (link.section === 'offers') return home.offers.products;
  if (link.section === 'new') return home.newArrivals;
  return home.featured;
}

// Foto do atalho de categoria/marca que uma coleção aponta (quando o link é de categoria ou marca).
export function collectionLinkImage(link: CollectionLink, categories: StorefrontCategory[]): string | null {
  if (link.type === 'section') return null;
  const id = String(link.id);
  return categories.find((category) => category.type === link.type && category.id === id)?.image ?? null;
}

// Tempo que falta, repartido em dias/horas/minutos/segundos. Nunca negativo.
export function splitCountdown(remainingMs: number) {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    finished: total === 0,
  };
}

export const pad2 = (value: number) => String(value).padStart(2, '0');

// Rola suavemente até uma seção (o cabeçalho fixo é compensado por `scroll-mt-*` na própria seção).
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
