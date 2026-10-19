'use client';

import type { StorefrontProduct } from '@/lib/api/types';
import { discountPercent, productImage } from '@/lib/storefront/home';
import { formatCurrency } from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';
import { SafeImage } from './SafeImage';

export const unitPrice = (product: StorefrontProduct) =>
  product.isPromoActive && product.promoPrice !== null ? product.promoPrice : product.price;

export function ProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: StorefrontProduct;
  inCart: number;
  onAdd: () => void;
}) {
  const promo = product.isPromoActive && product.promoPrice !== null;
  const discount = discountPercent(product);
  const image = productImage(product);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
      <div className="relative flex aspect-square items-center justify-center bg-white p-4">
        {image ? (
          <SafeImage
            src={image}
            alt={product.name}
            className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
            fallback={<Icon name="box" size={36} className="text-ink-200" />}
          />
        ) : (
          <Icon name="box" size={36} className="text-ink-200" />
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          {discount > 0 && (
            <span className="rounded-md bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">-{discount}%</span>
          )}
          {product.isNew && (
            <span className="rounded-md bg-primary-500 px-1.5 py-0.5 text-[11px] font-bold text-white">Novo</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5 pt-0">
        <p className="text-[11px] font-medium text-ink-400">{product.brand}</p>
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-ink-900">
          {product.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 leading-tight">
          <span className="text-base font-extrabold text-ink-900">{formatCurrency(unitPrice(product))}</span>
          {promo && <span className="text-xs text-ink-400 line-through">{formatCurrency(product.price)}</span>}
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!product.inStock}
          className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary-500 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400"
        >
          {!product.inStock ? (
            'Esgotado'
          ) : (
            <>
              <Icon name="basket" size={15} />
              {inCart > 0 ? `Adicionar mais (${inCart})` : 'Adicionar'}
            </>
          )}
        </button>
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
  quantityInCart,
  onAdd,
}: {
  products: StorefrontProduct[];
  quantityInCart: Map<string, number>;
  onAdd: (product: StorefrontProduct) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          inCart={quantityInCart.get(product.id) ?? 0}
          onAdd={() => onAdd(product)}
        />
      ))}
    </div>
  );
}
