'use client';

import { useEffect } from 'react';
import type { StorefrontProduct } from '@/lib/api/types';
import { productImage } from '@/lib/storefront/home';
import { formatCurrency } from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';
import { HeartIcon } from './icons';
import { unitPrice } from './ProductCard';
import { SafeImage } from './SafeImage';

// Gaveta com os produtos favoritados neste aparelho (sem conta). Dá para tirar da lista ou
// mandar direto para o carrinho.
export function FavoritesPanel({
  favorites,
  quantityInCart,
  onAdd,
  onRemove,
  onOpenProduct,
  onClose,
}: {
  favorites: StorefrontProduct[];
  quantityInCart: Map<string, number>;
  onAdd: (product: StorefrontProduct) => void;
  onRemove: (product: StorefrontProduct) => void;
  onOpenProduct?: (product: StorefrontProduct) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Favoritos">
      <button type="button" aria-label="Fechar favoritos" onClick={onClose} className="absolute inset-0 bg-ink-900/50" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink-900">
            <HeartIcon size={18} filled className="text-danger" />
            Meus favoritos
            {favorites.length > 0 && <span className="text-sm font-medium text-ink-400">({favorites.length})</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar favoritos"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 hover:bg-ink-50"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {favorites.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
              <HeartIcon size={24} />
            </span>
            <p className="mt-4 text-sm font-semibold text-ink-900">Nenhum favorito ainda</p>
            <p className="mt-1 text-xs text-ink-500">Toque no coração de um produto para guardar aqui. Fica salvo neste aparelho.</p>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-ink-100 overflow-y-auto px-5">
            {favorites.map((product) => {
              const image = productImage(product);
              const inCart = quantityInCart.get(product.id) ?? 0;
              return (
                <li key={product.id} className="flex gap-3 py-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50 p-2">
                    {image ? (
                      <SafeImage
                        src={image}
                        alt={product.name}
                        className="h-full w-full object-contain mix-blend-multiply"
                        fallback={<Icon name="box" size={24} className="text-ink-200" />}
                      />
                    ) : (
                      <Icon name="box" size={24} className="text-ink-200" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-700">{product.brand}</p>
                    {onOpenProduct ? (
                      <button
                        type="button"
                        onClick={() => onOpenProduct(product)}
                        className="line-clamp-2 cursor-pointer text-left text-[13px] font-medium leading-snug text-ink-800 transition hover:text-primary-700"
                      >
                        {product.name}
                      </button>
                    ) : (
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink-800">{product.name}</p>
                    )}
                    <p className="mt-1 text-sm font-bold text-ink-900">{formatCurrency(unitPrice(product))}</p>
                    <div className="mt-auto flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => onAdd(product)}
                        disabled={!product.inStock}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-50 text-xs font-semibold text-primary-700 transition hover:bg-primary-500 hover:text-white disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400"
                      >
                        {product.inStock ? (
                          <>
                            <Icon name="basket" size={15} />
                            {inCart > 0 ? `Adicionar mais (${inCart})` : 'Adicionar'}
                          </>
                        ) : (
                          'Esgotado'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(product)}
                        aria-label={`Remover ${product.name} dos favoritos`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-danger transition hover:bg-danger-soft"
                      >
                        <HeartIcon size={17} filled />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
