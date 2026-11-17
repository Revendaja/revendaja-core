'use client';

import { useEffect, useRef, useState } from 'react';
import type { NewSalePaymentMethod, StorefrontCategory, StorefrontConfig } from '@/lib/api/types';
import type { StorefrontFilter } from '@/lib/api/public';
import { scrollToSection } from '@/lib/storefront/home';
import { MIN_SEARCH_LENGTH } from '@/lib/storefront/searchHistory';
import { greetingName, type VisitorCep } from '@/lib/storefront/visitor';
import { PAYMENT_CHIPS } from '@/lib/utils/sales';
import { Icon } from '@/components/dashboard/icons';
import { CepPicker } from './CepPicker';
import { HeartIcon, TruckIcon } from './icons';
import { SafeImage } from './SafeImage';

// Botão de ícone do cabeçalho: sem borda, ícone na cor da marca (igual em menu, sacola e CEP).
const ICON_BTN =
  'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-700 transition hover:bg-primary-50 hover:text-primary-600';

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
  searchTerm = '',
  onSearch,
  onClearSearch = () => {},
  recentSearches = [],
  onRemoveRecent = () => {},
  onClearRecent = () => {},
  cartCount,
  onOpenCart,
  categories = [],
  activeFilter = null,
  onSelectCategory = () => {},
  onClearCategory = () => {},
  customerName = null,
  cep = null,
  onCepChange = () => {},
  favoritesCount = 0,
  onOpenFavorites,
  onSection,
  onLogoClick,
}: {
  storeName: string;
  // Logo da loja (URL). Sem logo (ou se ela não carregar), mostra a inicial do nome.
  logo?: string | null;
  announcement: StorefrontConfig['announcement'];
  acceptedPaymentMethods: NewSalePaymentMethod[];
  sections: NavSection[];
  // Busca que está valendo (a da página de resultados). O que o cliente digita fica só aqui, no campo:
  // nada vai ao servidor até ele dar Enter, tocar na lupa ou escolher uma busca recente.
  searchTerm?: string;
  onSearch: (term: string) => void;
  // Limpou a busca: volta para a home da loja.
  onClearSearch?: () => void;
  recentSearches?: string[];
  onRemoveRecent?: (term: string) => void;
  onClearRecent?: () => void;
  cartCount: number;
  onOpenCart: () => void;
  categories?: StorefrontCategory[];
  activeFilter?: StorefrontFilter;
  onSelectCategory?: (filter: NonNullable<StorefrontFilter>) => void;
  onClearCategory?: () => void;
  customerName?: string | null;
  cep?: VisitorCep | null;
  onCepChange?: (cep: VisitorCep | null) => void;
  favoritesCount?: number;
  onOpenFavorites?: () => void;
  // Quem usa o cabeçalho decide como ir a uma seção / ao topo (ex.: sair da página de detalhes antes).
  onSection?: (id: string) => void;
  onLogoClick?: () => void;
}) {
  const goSection = onSection ?? scrollToSection;
  // Sem texto próprio no canto direito, mostra como a loja recebe (formas de pagamento aceitas).
  const payments = PAYMENT_CHIPS.filter((chip) => acceptedPaymentMethods.includes(chip.method))
    .map((chip) => chip.label)
    .join(' · ');
  const rightText = announcement.rightText ?? (payments ? `Aceitamos ${payments}` : null);

  const [menuOpen, setMenuOpen] = useState(false);

  // Campo de busca: rascunho local + lista de buscas recentes (aparece ao focar o campo).
  const [draft, setDraft] = useState(searchTerm);
  const [recentOpen, setRecentOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // A busca em vigor mudou por fora (logo, "Voltar para a loja", categoria): o campo acompanha.
  useEffect(() => setDraft(searchTerm), [searchTerm]);
  const typed = draft.trim().toLowerCase();
  const visibleRecent = recentSearches.filter((item) => !typed || item.toLowerCase().includes(typed));

  // Menu pai > filho (desktop): passar o mouse numa categoria abre as marcas dela embaixo.
  const [flyout, setFlyout] = useState<{ key: string; left: number } | null>(null);
  const navWrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const categoryKey = (category: StorefrontCategory) => `${category.type}:${category.id}`;
  // Marca que já aparece dentro de uma categoria não repete na barra.
  const childBrandIds = new Set(categories.flatMap((category) => category.children?.map((child) => child.id) ?? []));
  const topLevel = categories.filter((category) => category.type === 'category' || !childBrandIds.has(category.id));
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const closeNow = () => {
    cancelClose();
    setFlyout(null);
  };
  const openFlyout = (category: StorefrontCategory, target: HTMLElement) => {
    cancelClose();
    if (!category.children?.length) return setFlyout(null);
    const wrap = navWrapRef.current?.getBoundingClientRect();
    if (!wrap) return;
    setFlyout({ key: categoryKey(category), left: Math.max(0, target.getBoundingClientRect().left - wrap.left) });
  };
  const closeFlyoutSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setFlyout(null), 120);
  };
  const flyoutCategory = flyout ? topLevel.find((category) => categoryKey(category) === flyout.key) : undefined;

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  function pick(action: () => void) {
    setMenuOpen(false);
    action();
  }

  function runSearch(term: string) {
    const clean = term.trim();
    setRecentOpen(false);
    if (clean.length >= MIN_SEARCH_LENGTH) {
      setDraft(clean);
      searchInputRef.current?.blur();
      onSearch(clean);
    } else if (!clean && searchTerm) {
      // Enter com o campo vazio, estando numa busca: sai dela.
      onClearSearch();
    }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    runSearch(draft);
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-x-6">
          {/* Celular: linha 1 = logo, sacola e menu; linha 2 = busca e CEP. Desktop: tudo numa linha só. */}
          <button
            type="button"
            onClick={onLogoClick ?? (() => window.scrollTo({ top: 0, behavior: 'smooth' }))}
            className="order-1 mr-auto flex min-w-0 shrink-0 items-center gap-2.5 text-left md:mr-0"
            aria-label={`${storeName}: ir para o início da loja`}
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

          <div className="order-2 flex items-center md:contents">
            {onOpenFavorites && (
              <button
                type="button"
                onClick={onOpenFavorites}
                aria-label={`Abrir favoritos (${favoritesCount})`}
                className={`${ICON_BTN} md:order-5`}
              >
                <HeartIcon size={22} />
                {favoritesCount > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                    {favoritesCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenCart}
              aria-label={`Abrir carrinho (${cartCount} itens)`}
              className={`${ICON_BTN} md:order-6`}
            >
              <Icon name="basket" size={22} />
              {cartCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
              aria-expanded={menuOpen}
              className={`${ICON_BTN} -mr-2 md:hidden`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>

          <div className="order-3 flex basis-full items-center gap-2 md:contents">
            <form
              onSubmit={submitSearch}
              role="search"
              className="relative flex min-w-0 flex-1 md:order-2 md:mx-2"
              onBlur={(event) => {
                // Fecha a lista de recentes quando o foco sai do campo e da própria lista.
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRecentOpen(false);
              }}
              onKeyDown={(event) => event.key === 'Escape' && setRecentOpen(false)}
            >
              <label className="flex h-11 w-full items-center gap-2 rounded-xl bg-ink-50 px-4 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-300 md:h-10 md:px-3.5">
                <input
                  ref={searchInputRef}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setRecentOpen(true);
                  }}
                  onFocus={() => setRecentOpen(true)}
                  placeholder="Busque aqui seu produto..."
                  aria-label="Buscar produto"
                  enterKeyHint="search"
                  autoComplete="off"
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-500 md:text-sm"
                />
                {draft && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft('');
                      if (searchTerm) onClearSearch();
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Limpar busca"
                    className="text-ink-400 hover:text-ink-700"
                  >
                    <Icon name="close" size={15} />
                  </button>
                )}
                <button type="submit" aria-label="Pesquisar" className="shrink-0 text-primary-700 transition hover:text-primary-600">
                  <Icon name="search" size={20} />
                </button>
              </label>

              {recentOpen && visibleRecent.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Buscas recentes"
                  className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl bg-white py-1.5 shadow-[0_12px_28px_rgba(16,24,40,0.14)] ring-1 ring-ink-100"
                >
                  <div className="flex items-center justify-between px-4 pb-1 pt-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Buscas recentes</p>
                    <button type="button" onClick={onClearRecent} className="text-[11px] font-semibold text-primary-600 hover:underline">
                      Limpar histórico
                    </button>
                  </div>
                  {visibleRecent.map((item) => (
                    <div key={item} className="flex items-center transition hover:bg-ink-50">
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => runSearch(item)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-800"
                      >
                        <Icon name="clock" size={16} className="shrink-0 text-ink-400" />
                        <span className="truncate">{item}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveRecent(item)}
                        aria-label={`Remover ${item} do histórico`}
                        className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </form>

            <div className="shrink-0 md:order-3">
              <CepPicker cep={cep} onChange={onCepChange} />
            </div>
          </div>

          <p className="order-4 hidden shrink-0 items-center gap-2 text-ink-700 md:flex" aria-label="Cliente">
            <Icon name="user" size={18} className="text-ink-500" />
            <span className="text-[13px]">
              Bem-vindo, <strong className="font-semibold text-ink-900">{greetingName(customerName)}</strong>
            </span>
          </p>
        </div>

        {/* Categorias do estoque da loja + atalhos das seções que existem. Só no desktop: no celular a página já tem "Compre por categoria". */}
        {(categories.length > 0 || sections.length > 0) && (
          <div
            ref={navWrapRef}
            className="relative hidden border-t border-ink-100 md:block"
            onMouseLeave={closeFlyoutSoon}
            onKeyDown={(event) => event.key === 'Escape' && closeNow()}
          >
            <nav aria-label="Categorias">
              <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 py-1.5 md:px-4" onScroll={closeNow}>
                {categories.length > 0 && (
                  <NavButton active={activeFilter === null} onClick={onClearCategory} onHover={closeNow}>
                    Todos
                  </NavButton>
                )}
                {topLevel.map((category) => {
                  const hasChildren = Boolean(category.children?.length);
                  const key = categoryKey(category);
                  return (
                    <NavButton
                      key={key}
                      active={activeFilter?.type === category.type && activeFilter.id === category.id}
                      onClick={() => onSelectCategory({ type: category.type, id: category.id })}
                      onHover={(target) => openFlyout(category, target)}
                      expanded={hasChildren ? flyout?.key === key : undefined}
                    >
                      {category.name}
                      {hasChildren && <ChevronDown />}
                    </NavButton>
                  );
                })}
                {categories.length > 0 && sections.length > 0 && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-ink-200" />}
                {sections.map((section) => (
                  <NavButton key={section.id} onClick={() => goSection(section.id)} onHover={closeNow}>
                    {section.label}
                  </NavButton>
                ))}
              </div>
            </nav>

            {flyout && flyoutCategory?.children && (
              <div className="absolute top-full z-40 pt-1" style={{ left: flyout.left }} onMouseEnter={cancelClose}>
                <div className="min-w-56 max-w-xl rounded-2xl border border-ink-100 bg-white p-2 shadow-[0_12px_32px_rgba(16,24,40,0.14)]">
                  <button
                    type="button"
                    onClick={() => {
                      closeNow();
                      onSelectCategory({ type: flyoutCategory.type, id: flyoutCategory.id });
                    }}
                    className="flex w-full items-center justify-between gap-6 rounded-xl px-3 py-2 text-left text-[13px] font-semibold text-primary-700 transition hover:bg-primary-50"
                  >
                    Ver tudo em {flyoutCategory.name}
                    <span className="text-xs font-medium text-ink-400">{flyoutCategory.count}</span>
                  </button>
                  <div className="my-1 h-px bg-ink-100" />
                  <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {flyoutCategory.children.map((child) => (
                      <li key={categoryKey(child)}>
                        <button
                          type="button"
                          onClick={() => {
                            closeNow();
                            onSelectCategory({ type: child.type, id: child.id });
                          }}
                          className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left text-[13px] transition hover:bg-ink-50 hover:text-primary-600 ${
                            activeFilter?.type === child.type && activeFilter.id === child.id
                              ? 'bg-primary-50 font-semibold text-primary-700'
                              : 'text-ink-700'
                          }`}
                        >
                          <span className="truncate">{child.name}</span>
                          <span className="text-xs text-ink-400">{child.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-ink-900/50" />
          <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <p className="text-[13px] text-ink-700">
                Bem-vindo, <strong className="font-semibold text-ink-900">{greetingName(customerName)}</strong>
              </p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 hover:bg-ink-50"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <nav aria-label="Menu" className="flex-1 overflow-y-auto p-3">
              {categories.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Categorias</p>
                  <MenuItem active={activeFilter === null} onClick={() => pick(() => onClearCategory())}>
                    Todos
                  </MenuItem>
                  {categories.map((category) => (
                    <MenuItem
                      key={`${category.type}:${category.id}`}
                      active={activeFilter?.type === category.type && activeFilter.id === category.id}
                      onClick={() => pick(() => onSelectCategory({ type: category.type, id: category.id }))}
                    >
                      {category.name}
                    </MenuItem>
                  ))}
                </>
              )}
              {sections.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Seções</p>
                  {sections.map((section) => (
                    <MenuItem key={section.id} onClick={() => pick(() => goSection(section.id))}>
                      {section.label}
                    </MenuItem>
                  ))}
                </>
              )}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="ml-1 inline-block">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function NavButton({
  active = false,
  expanded,
  onClick,
  onHover,
  children,
}: {
  active?: boolean;
  expanded?: boolean;
  onClick: () => void;
  onHover?: (target: HTMLElement) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(event) => onHover?.(event.currentTarget)}
      onFocus={(event) => onHover?.(event.currentTarget)}
      aria-pressed={active}
      aria-haspopup={expanded === undefined ? undefined : 'true'}
      aria-expanded={expanded}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        active || expanded ? 'bg-primary-50 text-primary-700' : 'text-ink-600 hover:bg-ink-50 hover:text-primary-600'
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({
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
      className={`block w-full rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition ${
        active ? 'bg-primary-50 text-primary-700' : 'text-ink-700 hover:bg-ink-50'
      }`}
    >
      {children}
    </button>
  );
}
