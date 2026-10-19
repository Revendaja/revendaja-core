'use client';

import type { NewSalePaymentMethod, StorefrontConfig } from '@/lib/api/types';
import { SECTION_IDS, scrollToSection } from '@/lib/storefront/home';
import { PAYMENT_CHIPS } from '@/lib/utils/sales';
import { Icon } from '@/components/dashboard/icons';
import { TruckIcon } from './icons';

export type NavSection = { id: string; label: string };

// Barra de aviso (topo), cabeçalho fixo com busca e carrinho, e o menu das seções que existem.
export function StorefrontHeader({
  storeName,
  announcement,
  acceptedPaymentMethods,
  sections,
  query,
  onQueryChange,
  cartCount,
  onOpenCart,
}: {
  storeName: string;
  announcement: StorefrontConfig['announcement'];
  acceptedPaymentMethods: NewSalePaymentMethod[];
  sections: NavSection[];
  query: string;
  onQueryChange: (value: string) => void;
  cartCount: number;
  onOpenCart: () => void;
}) {
  // Sem texto próprio no canto direito, mostra como a loja recebe (formas de pagamento aceitas).
  const payments = PAYMENT_CHIPS.filter((chip) => acceptedPaymentMethods.includes(chip.method))
    .map((chip) => chip.label)
    .join(' · ');
  const rightText = announcement.rightText ?? (payments ? `Aceitamos ${payments}` : null);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    scrollToSection(SECTION_IDS.catalog);
  }

  return (
    <>
      {announcement.enabled && (
        <div className="bg-ink-900 text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 text-xs">
            <p className="min-w-0 truncate font-medium">{announcement.text}</p>
            {rightText && (
              <p className="hidden shrink-0 items-center gap-1.5 text-white/80 sm:flex">
                <TruckIcon size={14} />
                {rightText}
              </p>
            )}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:gap-6">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex min-w-0 shrink-0 items-center gap-2.5 text-left"
            aria-label={`${storeName}: voltar ao topo`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-lg font-bold text-white">
              {storeName.charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-44 truncate text-base font-bold tracking-tight text-ink-900 sm:block">
              {storeName}
            </span>
          </button>

          <nav aria-label="Seções da loja" className="hidden items-center gap-5 lg:flex">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className="text-[13px] font-medium text-ink-600 transition hover:text-primary-600"
              >
                {section.label}
              </button>
            ))}
          </nav>

          <form onSubmit={submitSearch} role="search" className="ml-auto flex min-w-0 flex-1 md:max-w-xs">
            <label className="flex h-10 w-full items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3.5 transition focus-within:border-primary-500 focus-within:bg-white">
              <Icon name="search" size={16} className="shrink-0 text-ink-400" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar produtos..."
                aria-label="Buscar produto"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
              />
              {query && (
                <button type="button" onClick={() => onQueryChange('')} aria-label="Limpar busca" className="text-ink-300 hover:text-ink-600">
                  <Icon name="close" size={15} />
                </button>
              )}
            </label>
          </form>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={`Abrir carrinho (${cartCount} itens)`}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition hover:border-primary-500 hover:text-primary-600"
          >
            <Icon name="basket" size={18} />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* No celular o menu vira uma faixa rolável abaixo do cabeçalho. */}
        {sections.length > 0 && (
          <nav aria-label="Seções da loja" className="flex gap-1 overflow-x-auto border-t border-ink-100 px-3 py-1.5 lg:hidden">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50 hover:text-primary-600"
              >
                {section.label}
              </button>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
