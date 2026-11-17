'use client';

import type { StorefrontProduct } from '@/lib/api/types';
import { discountPercent, productImage } from '@/lib/storefront/home';
import { formatCurrency } from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';
import { HeartIcon } from './icons';
import { SafeImage } from './SafeImage';

export const unitPrice = (product: StorefrontProduct) =>
  product.isPromoActive && product.promoPrice !== null ? product.promoPrice : product.price;

export function ProductCard({
  product,
  favorite = false,
  onToggleFavorite,
  onOpen,
}: {
  product: StorefrontProduct;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  // Abre a página de detalhes (clique na foto ou no nome).
  onOpen?: () => void;
}) {
  const promo = product.isPromoActive && product.promoPrice !== null;
  const discount = discountPercent(product);
  const image = productImage(product);
  const photo = image ? (
    <SafeImage
      src={image}
      alt={product.name}
      className="h-full w-full object-contain mix-blend-multiply transition duration-500 group-hover:scale-105"
      fallback={<Icon name="box" size={36} className="text-ink-200" />}
    />
  ) : (
    <Icon name="box" size={36} className="text-ink-200" />
  );

  return (
    <article className="group flex flex-col rounded-2xl bg-white p-2 ring-1 ring-ink-100 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(16,24,40,0.10)] hover:ring-primary-200">
      {/* Foto sobre fundo suave (igual à busca do topo); mix-blend-multiply some com o branco das fotos. */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-ink-50 p-4">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Ver detalhes: ${product.name}`}
            className="absolute inset-0 flex cursor-pointer items-center justify-center p-4"
          >
            {photo}
          </button>
        ) : (
          photo
        )}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}
            className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:scale-110 hover:bg-white ${
              favorite ? 'text-danger' : 'text-ink-500 hover:text-danger'
            }`}
          >
            <HeartIcon size={17} filled={favorite} />
          </button>
        )}
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
          {discount > 0 && (
            <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">-{discount}%</span>
          )}
          {product.isNew && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tracking-wide text-primary-700 ring-1 ring-primary-200">
              Novo
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-2 pb-2 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-700">{product.brand}</p>
        {/* Título sempre com 2 linhas de altura (o clamp vai no próprio botão: dentro de um <button> inline ele não pega). */}
        <h3 className="mt-1 h-[2.25rem] overflow-hidden text-[13px] font-medium leading-snug text-ink-800">
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="line-clamp-2 block w-full cursor-pointer text-left transition hover:text-primary-700"
            >
              {product.name}
            </button>
          ) : (
            <span className="line-clamp-2 block">{product.name}</span>
          )}
        </h3>
        {/* Preço antigo em cima do novo. A linha do antigo existe mesmo sem promoção, para o preço ficar
            na mesma altura em todos os cartões. */}
        <div className="mt-auto flex flex-col pt-2 leading-tight">
          <span className="h-4 text-xs text-ink-400 line-through" aria-hidden={!promo || undefined}>
            {promo ? formatCurrency(product.price) : null}
          </span>
          <span className="text-lg font-bold tracking-tight text-ink-900">{formatCurrency(unitPrice(product))}</span>
        </div>
        {!product.inStock && <p className="mt-2 text-xs font-semibold text-ink-400">Esgotado</p>}
      </div>
    </article>
  );
}

// Título da seção + (opcional) link à direita + o conteúdo.
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold tracking-tight text-ink-900">{title}</h2>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="text-xs font-semibold text-primary-600 hover:underline">
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

export function ProductGrid({
  products,
  favoriteIds,
  onToggleFavorite,
  onOpenProduct,
}: {
  products: StorefrontProduct[];
  favoriteIds?: Set<string>;
  onToggleFavorite?: (product: StorefrontProduct) => void;
  onOpenProduct?: (product: StorefrontProduct) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          favorite={favoriteIds?.has(product.id) ?? false}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(product) : undefined}
          onOpen={onOpenProduct ? () => onOpenProduct(product) : undefined}
        />
      ))}
    </div>
  );
}
