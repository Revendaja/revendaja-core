'use client';

import type { NewSalePaymentMethod, StorefrontCategory, StorefrontConfig } from '@/lib/api/types';
import type { StorefrontFilter } from '@/lib/api/public';
import { SECTION_IDS, scrollToSection } from '@/lib/storefront/home';
import { greetingName, type VisitorCep } from '@/lib/storefront/visitor';
import { PAYMENT_CHIPS } from '@/lib/utils/sales';
import { Icon } from '@/components/dashboard/icons';
import { CepPicker } from './CepPicker';
import { TruckIcon } from './icons';
import { SafeImage } from './SafeImage';

export type NavSection = { id: string; label: string };

// Sem logo (ou se ela não carregar): inicial da loja num quadrado laranja e o nome ao lado.
function InitialAndName({ storeName }: { storeName: string }) {
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-500 text-lg font-bold text-white">
        {storeName.charAt(0).toUpperCase()}
      </span>
      <span className="hidden max-w-44 truncate text-base font-bold tracking-tight text-ink-900 sm:block">
        {storeName}
      </span>
    </>
  );
}

// Barra de aviso (topo), cabeçalho fixo (logo, busca, CEP, saudação e sacola) e, embaixo, as
// categorias que vêm do estoque da loja. Cliente não tem conta: a saudação é "Visitante" até o
// primeiro pedido, quando o nome fica salvo neste aparelho.
export function StorefrontHeader({
  storeName,
  logo = null,
  announcement,
  acceptedPaymentMethods,
  sections,
  query,
  onQueryChange,
  cartCount,
  onOpenCart,
  categories = [],
  activeFilter = null,
  onSelectCategory = () => {},
  onClearCategory = () => {},
  customerName = null,
  cep = null,
  onCepChange = () => {},
}: {
  storeName: string;
  // Logo da loja (URL). Sem logo (ou se ela não carregar), mostra a inicial do nome.
  logo?: string | null;
  announcement: StorefrontConfig['announcement'];
  acceptedPaymentMethods: NewSalePaymentMethod[];
  sections: NavSection[];
  query: string;
  onQueryChange: (value: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  categories?: StorefrontCategory[];
  activeFilter?: StorefrontFilter;
  onSelectCategory?: (filter: NonNullable<StorefrontFilter>) => void;
  onClearCategory?: () => void;
  customerName?: string | null;
  cep?: VisitorCep | null;
  onCepChange?: (cep: VisitorCep | null) => void;
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
            {/* Letreiro: o texto corre da direita para a esquerda sem parar (pausa ao passar o mouse). */}
            <div className="announcement-marquee min-w-0 flex-1 overflow-hidden">
              <div className="announcement-track">
                {/* A cópia que fecha o laço vem do CSS (data-text), então o texto aparece uma vez só para leitores de tela. */}
                <p className="announcement-text whitespace-nowrap font-medium" data-text={announcement.text}>
                  {announcement.text}
                </p>
              </div>
            </div>
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3 md:flex-nowrap md:gap-6">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="mr-auto flex min-w-0 shrink-0 items-center gap-2.5 text-left md:mr-0"
            aria-label={`${storeName}: voltar ao topo`}
          >
            {logo ? (
              // Com logo, só ela aparece (ela já traz o nome da marca): sem ícone nem nome repetidos.
              <SafeImage
                src={logo}
                alt={storeName}
                loading="eager"
                className="h-11 w-auto max-w-40 object-contain sm:max-w-56"
                fallback={<InitialAndName storeName={storeName} />}
              />
            ) : (
              <InitialAndName storeName={storeName} />
            )}
          </button>

          {/* No celular a busca vai para uma linha própria, embaixo, larga e alta para digitar. */}
          <form onSubmit={submitSearch} role="search" className="order-last flex min-w-0 basis-full md:order-none md:mx-2 md:flex-1 md:basis-auto">
            <label className="flex h-12 w-full items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-4 md:h-10 md:px-3.5 transition focus-within:border-primary-500 focus-within:bg-white">
              <Icon name="search" size={16} className="shrink-0 text-ink-400" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar produtos..."
                aria-label="Buscar produto"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-base text-ink-900 md:text-sm outline-none placeholder:text-ink-400"
              />
              {query && (
                <button type="button" onClick={() => onQueryChange('')} aria-label="Limpar busca" className="text-ink-300 hover:text-ink-600">
                  <Icon name="close" size={15} />
                </button>
              )}
            </label>
          </form>

          <CepPicker cep={cep} onChange={onCepChange} />

          <p className="hidden shrink-0 items-center gap-2 text-ink-700 md:flex" aria-label="Cliente">
            <Icon name="user" size={18} className="text-ink-500" />
            <span className="text-[13px]">
              Bem-vindo, <strong className="font-semibold text-ink-900">{greetingName(customerName)}</strong>
            </span>
          </p>

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

        {/* Categorias do estoque da loja + atalhos das seções que existem. Só no desktop: no celular a página já tem "Compre por categoria". */}
        {(categories.length > 0 || sections.length > 0) && (
          <nav aria-label="Categorias" className="hidden border-t border-ink-100 md:block">
            <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 py-1.5 md:px-4">
              {categories.length > 0 && (
                <NavButton active={activeFilter === null} onClick={onClearCategory}>
                  Todos
                </NavButton>
              )}
              {categories.map((category) => (
                <NavButton
                  key={`${category.type}:${category.id}`}
                  active={activeFilter?.type === category.type && activeFilter.id === category.id}
                  onClick={() => onSelectCategory({ type: category.type, id: category.id })}
                >
                  {category.name}
                </NavButton>
              ))}
              {categories.length > 0 && sections.length > 0 && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-ink-200" />}
              {sections.map((section) => (
                <NavButton key={section.id} onClick={() => scrollToSection(section.id)}>
                  {section.label}
                </NavButton>
              ))}
            </div>
          </nav>
        )}
      </header>
    </>
  );
}

function NavButton({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        active ? 'bg-primary-50 text-primary-700' : 'text-ink-600 hover:bg-ink-50 hover:text-primary-600'
      }`}
    >
      {children}
    </button>
  );
}
