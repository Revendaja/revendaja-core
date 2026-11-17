'use client';

import { useState } from 'react';
import type { StorefrontProduct } from '@/lib/api/types';
import { discountPercent, productImage } from '@/lib/storefront/home';
import { maskCep, type VisitorCep } from '@/lib/storefront/visitor';
import { formatCurrency } from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';
import { HeartIcon } from './icons';
import { ProductGrid, SectionHeader, unitPrice } from './ProductCard';
import { SafeImage } from './SafeImage';

// Página de detalhes do produto (estilo marketplace): foto grande, preço, quantidade, "Comprar agora"
// e "Adicionar ao carrinho", descrição e outros produtos parecidos. O carrinho, os favoritos e o
// cabeçalho continuam os da vitrine: isto só troca o miolo da página.
export function ProductDetail({
  product,
  related,
  loadingRelated,
  inCart,
  maxQuantity,
  cep,
  favoriteIds,
  onToggleFavorite,
  onAdd,
  onBuyNow,
  onBack,
  onOpenProduct,
}: {
  product: StorefrontProduct;
  related: StorefrontProduct[];
  loadingRelated: boolean;
  inCart: number;
  maxQuantity: number;
  cep: VisitorCep | null;
  favoriteIds: Set<string>;
  onToggleFavorite: (product: StorefrontProduct) => void;
  onAdd: (product: StorefrontProduct, quantity: number) => void;
  onBuyNow: (product: StorefrontProduct, quantity: number) => void;
  onBack: () => void;
  onOpenProduct: (product: StorefrontProduct) => void;
}) {
  // Troca de produto (clicou num parecido) reinicia a quantidade: o pai remonta pela `key`.
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const promo = product.isPromoActive && product.promoPrice !== null;
  const discount = discountPercent(product);
  const image = productImage(product);
  const favorite = favoriteIds.has(product.id);
  const total = unitPrice(product) * quantity;

  function add() {
    onAdd(product, quantity);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1800);
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 rounded-full py-1.5 pr-3 text-[13px] font-semibold text-primary-700 transition hover:text-primary-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 5-7 7 7 7" />
          </svg>
          Voltar
        </button>

        <article className="grid gap-6 rounded-2xl bg-white p-3 ring-1 ring-ink-100 sm:p-5 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-ink-50 p-6 sm:p-10">
            {image ? (
              <SafeImage
                src={product.image ?? image}
                alt={product.name}
                loading="eager"
                className="h-full w-full object-contain mix-blend-multiply"
                fallback={<Icon name="box" size={56} className="text-ink-200" />}
              />
            ) : (
              <Icon name="box" size={56} className="text-ink-200" />
            )}
            <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
              {discount > 0 && (
                <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-bold tracking-wide text-white">-{discount}%</span>
              )}
              {product.isNew && (
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold tracking-wide text-primary-700 ring-1 ring-primary-200">
                  Novo
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onToggleFavorite(product)}
              aria-pressed={favorite}
              aria-label={favorite ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}
              className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:scale-110 hover:bg-white ${
                favorite ? 'text-danger' : 'text-ink-500 hover:text-danger'
              }`}
            >
              <HeartIcon size={20} filled={favorite} />
            </button>
          </div>

          <div className="flex flex-col px-1 pb-1 lg:py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-700">{product.brand}</p>
            <h1 className="mt-1.5 text-xl font-semibold leading-snug tracking-tight text-ink-900 sm:text-2xl">{product.name}</h1>

            <div className="mt-5">
              {promo && <p className="text-sm text-ink-400 line-through">{formatCurrency(product.price)}</p>}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">{formatCurrency(unitPrice(product))}</span>
                {discount > 0 && <span className="text-sm font-semibold text-danger">{discount}% OFF</span>}
              </div>
            </div>

            <p className={`mt-4 text-sm font-semibold ${product.inStock ? 'text-emerald-600' : 'text-danger'}`}>
              {product.inStock ? 'Em estoque' : 'Esgotado'}
            </p>

            {product.inStock && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm text-ink-600">Quantidade</span>
                <div className="flex h-11 items-center rounded-xl bg-ink-50">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={quantity <= 1}
                    aria-label="Diminuir quantidade"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-primary-700 transition hover:bg-primary-50 disabled:text-ink-300 disabled:hover:bg-transparent"
                  >
                    <Icon name="minus" size={16} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-ink-900" aria-live="polite">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                    disabled={quantity >= maxQuantity}
                    aria-label="Aumentar quantidade"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-primary-700 transition hover:bg-primary-50 disabled:text-ink-300 disabled:hover:bg-transparent"
                  >
                    <span aria-hidden className="text-lg leading-none">+</span>
                  </button>
                </div>
                {quantity > 1 && <span className="text-sm text-ink-500">Total {formatCurrency(total)}</span>}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5 sm:max-w-sm">
              <button
                type="button"
                onClick={() => onBuyNow(product, quantity)}
                disabled={!product.inStock}
                className="flex h-12 items-center justify-center rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400"
              >
                {product.inStock ? 'Comprar agora' : 'Esgotado'}
              </button>
              {product.inStock && (
                <button
                  type="button"
                  onClick={add}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary-50 text-sm font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  <Icon name={justAdded ? 'check' : 'basket'} size={17} />
                  {justAdded ? 'Adicionado ao carrinho' : inCart > 0 ? `Adicionar mais (${inCart} no carrinho)` : 'Adicionar ao carrinho'}
                </button>
              )}
            </div>

            <dl className="mt-6 flex flex-col gap-3 border-t border-ink-100 pt-5 text-sm">
              {cep && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <dt className="text-ink-500">Entrega em</dt>
                  <dd className="font-medium text-ink-800">CEP {maskCep(cep.cep)}</dd>
                </div>
              )}
            </dl>
          </div>
        </article>
      </div>

      {product.description?.trim() && (
        <section aria-label="Descrição do produto" className="rounded-2xl bg-white p-5 ring-1 ring-ink-100 sm:p-6">
          <h2 className="text-lg font-bold tracking-tight text-ink-900">Descrição</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">{product.description.trim()}</p>
        </section>
      )}

      {(related.length > 0 || loadingRelated) && (
        <section aria-label="Quem viu também gostou">
          <SectionHeader title="Quem viu também gostou" />
          {related.length > 0 ? (
            <ProductGrid
              products={related}
              favoriteIds={favoriteIds}
              onToggleFavorite={onToggleFavorite}
              onOpenProduct={onOpenProduct}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((key) => (
                <div key={key} className="h-72 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
