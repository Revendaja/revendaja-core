'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createStorefrontOrder,
  getStorefront,
  previewCoupon,
  recordStorefrontVisit,
  STOREFRONT_PAGE_SIZE,
  type StorefrontFilter,
} from '@/lib/api/public';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import type {
  CollectionLink,
  CouponPreview,
  FulfillmentMethod,
  NewSalePaymentMethod,
  OnlineOrderReceipt,
  Storefront,
  StorefrontHome,
  StorefrontProduct,
} from '@/lib/api/types';
import { formatCurrency, parsePriceInput } from '@/lib/utils/format';
import { createSaleAttemptTracker, isDefinitiveRejection, saleContentKey } from '@/lib/utils/saleAttempt';
import { PAYMENT_CHIPS, PAYMENT_ICON, roundMoney } from '@/lib/utils/sales';
import { isValidWhatsapp, maskWhatsapp } from '@/lib/utils/validation';
import { newRequestId } from '@/lib/utils/uuid';
import {
  SECTION_IDS,
  resolveLink,
  scrollToSection,
} from '@/lib/storefront/home';
import {
  addressFromCep,
  readSavedCep,
  readSavedCustomer,
  writeSavedCep,
  writeSavedCustomer,
  type SavedCustomer,
  type VisitorCep,
} from '@/lib/storefront/visitor';
import { useSubmitting } from '@/hooks/useSubmitting';
import { Icon } from '@/components/dashboard/icons';
import { MoneyField } from '@/components/products/FormParts';
import { BrandsStrip } from '@/components/storefront/BrandsStrip';
import { PromoBanner } from '@/components/storefront/PromoBanner';
import { BannerCarousel } from '@/components/storefront/BannerCarousel';
import { FavoritesPanel } from '@/components/storefront/FavoritesPanel';
import { PrivacyNotice } from '@/components/storefront/PrivacyNotice';
import { StorefrontSplash } from '@/components/storefront/StorefrontSplash';
import { cartStorageKey } from '@/lib/storefront/privacy';
import { platformUrl } from '@/lib/storefront/domain';
import { ProductDetail } from '@/components/storefront/ProductDetail';
import { ProductGrid, SectionHeader, unitPrice } from '@/components/storefront/ProductCard';
import { useFavorites } from '@/lib/storefront/favorites';
import { useRecentSearches } from '@/lib/storefront/searchHistory';
import { getStorefrontProduct } from '@/lib/api/public';
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter';
import { StorefrontHeader, type NavSection } from '@/components/storefront/StorefrontHeader';

type CartLine = { product: StorefrontProduct; quantity: number };

const MAX_CART_ITEMS = 50;
const MAX_QUANTITY = 99;
const NAME_MAX = 120;
const ADDRESS_MIN = 8;
const ADDRESS_MAX = 300;

export function StorefrontView({ initial, home }: { initial: Storefront; home: StorefrontHome }) {
  const { store, config } = home;
  const handle = store.handle;
  const cartKey = cartStorageKey(handle);

  const [products, setProducts] = useState(initial.products.items);
  const [total, setTotal] = useState(initial.products.total);
  const [page, setPage] = useState(initial.products.page);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Busca confirmada (Enter, lupa ou item do histórico). Digitar não consulta o servidor: o texto do
  // campo fica no cabeçalho até o cliente confirmar.
  const [searchTerm, setSearchTerm] = useState('');
  const recent = useRecentSearches(handle);
  // Atalho de categoria/marca escolhido (null = todos os produtos).
  const [filter, setFilter] = useState<StorefrontFilter>(null);
  // "Ver todos os produtos": a página de resultados sem busca nem filtro (a home não tem a lista completa).
  const [browseAll, setBrowseAll] = useState(false);

  // Link de categoria (ex.: compartilhado pelo app): `?categoria=<id>` abre a vitrine já filtrada.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('categoria');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    setFilter({ type: 'category', id });
    const timer = window.setTimeout(() => scrollToSection(SECTION_IDS.catalog), 300);
    return () => window.clearTimeout(timer);
  }, []);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const { favorites, ids: favoriteIds, toggle: toggleFavorite, hydrated: favoritesLoaded } = useFavorites(handle);
  // Abriu por um link de produto (?produto=): a tela de carregamento espera ele chegar.
  const [detailBooting, setDetailBooting] = useState(false);
  const firstSync = useRef(true);

  // Página de detalhes do produto: troca só o miolo da vitrine e põe `?produto=<id>` na URL (o botão
  // voltar fecha e o link dá para mandar no WhatsApp). Abre já com o produto do card e completa com
  // os "parecidos" que vêm da API.
  const [detail, setDetail] = useState<{ product: StorefrontProduct; related: StorefrontProduct[]; loading: boolean } | null>(null);
  const detailId = useRef<string | null>(null);
  // Quantas entradas de histórico a vitrine empurrou (para o "Voltar" saber se pode usar o history).
  const pushed = useRef(0);

  const loadDetail = useCallback(
    (id: string, snapshot: StorefrontProduct | null) => {
      detailId.current = id;
      setDetail((current) =>
        snapshot ? { product: snapshot, related: [], loading: true } : current?.product.id === id ? current : null,
      );
      getStorefrontProduct(handle, id)
        .then((data) => {
          if (detailId.current === id) setDetail({ product: data.product, related: data.related, loading: false });
          setDetailBooting(false);
        })
        .catch(() => {
          setDetailBooting(false);
          if (detailId.current !== id) return;
          // Sem o snapshot (link direto) e sem resposta: volta para a vitrine.
          setDetail((current) => (current ? { ...current, loading: false } : null));
        });
    },
    [handle],
  );

  function openProduct(product: StorefrontProduct) {
    window.history.pushState({ produto: product.id }, '', `${window.location.pathname}?produto=${product.id}`);
    pushed.current += 1;
    setCartOpen(false);
    setFavoritesOpen(false);
    loadDetail(product.id, product);
    window.scrollTo({ top: 0 });
  }

  // Botão "Voltar" da página: usa o histórico se a vitrine empurrou a entrada; senão (link direto) só fecha.
  function backFromDetail() {
    if (pushed.current > 0) {
      pushed.current -= 1;
      window.history.back();
      return;
    }
    detailId.current = null;
    window.history.replaceState(null, '', window.location.pathname);
    setDetail(null);
  }

  // Sai da página de detalhes (menu, busca, categoria...) e só então faz `then` (a lista precisa estar na tela).
  function leaveDetail(then: () => void) {
    if (!detail) return then();
    detailId.current = null;
    window.history.replaceState(null, '', window.location.pathname);
    setDetail(null);
    window.setTimeout(then, 60);
  }

  // Link direto (?produto=) e botões voltar/avançar do navegador.
  useEffect(() => {
    const sync = () => {
      const id = new URLSearchParams(window.location.search).get('produto');
      if (!id) {
        detailId.current = null;
        setDetail(null);
      } else if (detailId.current !== id) {
        if (firstSync.current) setDetailBooting(true);
        loadDetail(id, null);
      }
      firstSync.current = false;
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [loadDetail]);
  const [receipt, setReceipt] = useState<OnlineOrderReceipt | null>(null);

  // Quem já comprou neste aparelho e o CEP informado. Lê só depois de montar para o HTML do servidor
  // e o do cliente baterem (no servidor é sempre "Visitante").
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [cep, setCep] = useState<VisitorCep | null>(null);
  useEffect(() => {
    setCustomerName(readSavedCustomer()?.name ?? null);
    setCep(readSavedCep());
  }, []);

  function changeCep(next: VisitorCep | null) {
    setCep(next);
    writeSavedCep(next);
  }

  // Uma visita por sessão do navegador (não por recarregamento).
  useEffect(() => {
    try {
      const flag = `revendaja.visit.${handle}`;
      if (window.sessionStorage.getItem(flag)) return;
      window.sessionStorage.setItem(flag, '1');
    } catch {
      // sessionStorage indisponível: conta a visita mesmo assim.
    }
    void recordStorefrontVisit(handle);
  }, [handle]);

  // Carrinho sobrevive a um F5 (só neste navegador). Só grava depois de ler o que estava salvo: é estado
  // (não ref) porque, na montagem, o efeito de gravar roda com o carrinho ainda vazio e apagaria o salvo
  // (o modo estrito do React, que roda os efeitos duas vezes, faria a segunda leitura pegar o vazio).
  const [cartLoaded, setCartLoaded] = useState(false);
  // A vitrine só aparece depois de ler o que está salvo no aparelho (e de abrir o produto do link).
  const ready = cartLoaded && favoritesLoaded && !detailBooting;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cartKey);
      if (raw) setCart(JSON.parse(raw) as CartLine[]);
    } catch {
      // carrinho salvo ilegível: começa vazio.
    }
    setCartLoaded(true);
  }, [cartKey]);
  useEffect(() => {
    if (!cartLoaded) return;
    try {
      window.localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      // sem espaço/permissão: o carrinho segue na memória.
    }
  }, [cart, cartKey, cartLoaded]);

  // Busca/filtro: troca a lista pela primeira página. Respostas antigas são descartadas.
  const searchSeq = useRef(0);
  const firstRender = useRef(true);
  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const seq = ++searchSeq.current;
      setLoadingList(true);
      setListError(null);
      // Busca/filtro novo: some a lista anterior (esqueleto) em vez de mostrar produtos que não casam.
      if (replace) {
        setProducts([]);
        setTotal(0);
      }
      try {
        const data = await getStorefront(handle, { search: searchTerm, filter, page: nextPage, pageSize: STOREFRONT_PAGE_SIZE });
        if (seq !== searchSeq.current) return;
        setProducts((current) => (replace ? data.products.items : [...current, ...data.products.items]));
        setTotal(data.products.total);
        setPage(data.products.page);
      } catch (error) {
        if (seq === searchSeq.current) setListError(getErrorMessage(error));
      } finally {
        if (seq === searchSeq.current) setLoadingList(false);
      }
    },
    [handle, searchTerm, filter],
  );
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void fetchPage(1, true);
  }, [fetchPage]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = roundMoney(cart.reduce((sum, line) => sum + unitPrice(line.product) * line.quantity, 0));

  function addToCart(product: StorefrontProduct, amount = 1) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + amount) } : line,
        );
      }
      if (current.length >= MAX_CART_ITEMS) return current;
      return [...current, { product, quantity: Math.min(MAX_QUANTITY, amount) }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + delta) } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  // Escolher um atalho filtra a lista de produtos e leva até ela.
  // Sem filtro (`null`) = "todos os produtos". Em qualquer caso a vitrine vira a página de resultados.
  function applyFilter(next: StorefrontFilter) {
    setFilter(next);
    setSearchTerm('');
    setBrowseAll(next === null);
    leaveDetail(() => window.scrollTo({ top: 0 }));
  }

  // Vai até uma seção da home. Se a vitrine está na página de resultados (a home não está na tela),
  // volta para a home primeiro e só então rola.
  function goSection(id: string) {
    const fromResults = resultsMode;
    if (fromResults) {
      setFilter(null);
      setSearchTerm('');
      setBrowseAll(false);
    }
    leaveDetail(() => (fromResults ? void window.setTimeout(() => scrollToSection(id), 60) : scrollToSection(id)));
  }

  // Sai da página de resultados e volta à home da loja.
  function clearSearch() {
    setFilter(null);
    setSearchTerm('');
    setBrowseAll(false);
    leaveDetail(() => window.scrollTo({ top: 0 }));
  }

  // Busca confirmada: vira a página de resultados (no lugar da home), a partir do topo. Uma busca nova
  // não carrega o filtro de categoria/marca de antes, e entra no histórico.
  function submitSearch(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setFilter(null);
    setBrowseAll(false);
    setSearchTerm(clean);
    recent.add(clean);
    leaveDetail(() => window.scrollTo({ top: 0 }));
  }

  const quantityInCart = useMemo(() => new Map(cart.map((line) => [line.product.id, line.quantity])), [cart]);
  const hasMore = products.length < total;

  // Busca ou filtro ativo = página de resultados (padrão dos grandes e-commerces): some a home e fica só a lista.
  const resultsMode = searchTerm !== '' || filter !== null || browseAll;

  const hasOffers = home.offers.products.length > 0;
  const hasNew = home.newArrivals.length > 0;
  const hasFeatured = home.featured.length > 0;
  const hasAnyProduct = initial.products.total > 0;
  const activeFilterName = filter
    ? home.categories.find((category) => category.type === filter.type && category.id === filter.id)?.name ?? null
    : null;

  // As categorias ficam no cabeçalho; aqui só os atalhos de seções que existem nesta loja.
  // Categorias do rodapé: as de cima (marca que já está dentro de uma categoria não repete), no máximo 5.
  const childBrandIds = new Set(home.categories.flatMap((category) => category.children?.map((child) => child.id) ?? []));
  const footerCategories = home.categories
    .filter((category) => category.type === 'category' || !childBrandIds.has(category.id))
    .slice(0, 5);

  const navSections: NavSection[] = [
    ...(hasOffers ? [{ id: SECTION_IDS.offers, label: 'Ofertas' }] : []),
    ...(hasNew ? [{ id: SECTION_IDS.newArrivals, label: 'Novidades' }] : []),
  ];

  const existingSections = new Set<string>([
    ...(hasFeatured ? [SECTION_IDS.featured] : []),
    ...(hasOffers ? [SECTION_IDS.offers] : []),
    ...(hasNew ? [SECTION_IDS.newArrivals] : []),
  ]);

  // Destino de um link (banner ou coleção): filtra por categoria/marca ou rola até a seção. Seção
  // que não existe nesta loja (sem ofertas, sem novidades...) leva a todos os produtos.
  function openLink(link: CollectionLink) {
    const target = resolveLink(link);
    if (target.kind === 'filter') return applyFilter(target.filter);
    if (!existingSections.has(target.id)) return applyFilter(null);
    goSection(target.id);
  }

  return (
    <div className="min-h-screen bg-ink-50">
      {!ready && <StorefrontSplash storeName={store.storeName} logo={store.logo} />}
      <StorefrontHeader
        storeName={store.storeName}
        logo={store.logo}
        announcement={config.announcement}
        acceptedPaymentMethods={store.acceptedPaymentMethods}
        sections={navSections}
        searchTerm={searchTerm}
        onSearch={submitSearch}
        onClearSearch={clearSearch}
        recentSearches={recent.searches}
        onRemoveRecent={recent.remove}
        onClearRecent={recent.clear}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        categories={home.categories}
        activeFilter={filter}
        onSelectCategory={applyFilter}
        onClearCategory={() => applyFilter(null)}
        customerName={customerName}
        cep={cep}
        onCepChange={changeCep}
        favoritesCount={favorites.length}
        onOpenFavorites={() => setFavoritesOpen(true)}
        onSection={goSection}
        onLogoClick={clearSearch}
      />

      <main id={SECTION_IDS.top} className="mx-auto flex max-w-6xl scroll-mt-28 flex-col gap-10 px-4 pt-5">
        {detail ? (
          <ProductDetail
            key={detail.product.id}
            product={detail.product}
            related={detail.related}
            loadingRelated={detail.loading}
            inCart={quantityInCart.get(detail.product.id) ?? 0}
            maxQuantity={MAX_QUANTITY}
            cep={cep}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
            onAdd={addToCart}
            onBuyNow={(product, amount) => {
              addToCart(product, amount);
              setCartOpen(true);
            }}
            onBack={backFromDetail}
            onOpenProduct={openProduct}
          />
        ) : (
          <>
        {!resultsMode && (
          <>
        <BannerCarousel
          banners={config.banners}
          storeName={store.storeName}
          onOpen={(banner) => banner.link && openLink(banner.link)}
        />

        <BrandsStrip brands={home.brands} onSelect={(brand) => applyFilter({ type: 'brand', id: String(brand.id) })} />

        {hasFeatured && (
          <section id={SECTION_IDS.featured} aria-label="Produtos em destaque" className="scroll-mt-28">
            <SectionHeader title="Produtos em destaque" actionLabel="Ver todos os produtos" onAction={() => applyFilter(null)} />
            <ProductGrid products={home.featured} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onOpenProduct={openProduct} />
          </section>
        )}

        {hasOffers && (
          <section id={SECTION_IDS.offers} aria-label="Ofertas" className="scroll-mt-28">
            <SectionHeader title="Ofertas" />
            <ProductGrid products={home.offers.products} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onOpenProduct={openProduct} />
          </section>
        )}

        {hasAnyProduct && <PromoBanner onOpen={() => openLink({ type: 'section', section: 'catalog' })} />}

        {hasNew && (
          <section id={SECTION_IDS.newArrivals} aria-label="Novidades" className="scroll-mt-28">
            <SectionHeader title="Novidades" actionLabel="Ver todos os produtos" onAction={() => applyFilter(null)} />
            <ProductGrid products={home.newArrivals} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onOpenProduct={openProduct} />
          </section>
        )}

        {!hasAnyProduct && (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-400">
              <Icon name="box" size={24} />
            </span>
            <p className="mt-4 text-sm font-semibold text-ink-900">Esta loja ainda não tem produtos</p>
          </div>
        )}
          </>
        )}

        {resultsMode && (
        <section id={SECTION_IDS.catalog} aria-label="Resultados da busca" className="scroll-mt-28">
          <div className="mb-5">
              <button
                type="button"
                onClick={clearSearch}
                className="mb-3 flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
              >
                ← Voltar para a loja
              </button>
              <h1 className="text-xl font-bold tracking-tight text-ink-900">
                {searchTerm ? <>Resultados para “{searchTerm}”</> : (activeFilterName ?? 'Todos os produtos')}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {activeFilterName && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter(null);
                      if (!searchTerm) setBrowseAll(true);
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                    aria-label={`Remover filtro ${activeFilterName}`}
                  >
                    {activeFilterName}
                    <Icon name="close" size={13} />
                  </button>
                )}
                {total > 0 && !loadingList && (
                  <span className="ml-auto text-xs text-ink-400">
                    {total} {total === 1 ? 'produto' : 'produtos'}
                  </span>
                )}
              </div>
          </div>

          {listError && <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-xs font-medium text-danger">{listError}</p>}

          {products.length === 0 && !loadingList && !listError && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-400">
                <Icon name="box" size={24} />
              </span>
              <p className="mt-4 text-sm font-semibold text-ink-900">
                {searchTerm || filter ? 'Nenhum produto encontrado' : 'Esta loja ainda não tem produtos'}
              </p>
              {(searchTerm || filter) && <p className="mt-1 text-xs text-ink-400">Tente outra busca ou outra categoria.</p>}
              {resultsMode && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="mt-4 h-10 rounded-xl border border-ink-200 bg-white px-5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
                >
                  Ver todos os produtos
                </button>
              )}
            </div>
          )}

          <ProductGrid products={products} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} onOpenProduct={openProduct} />
          {loadingList && products.length === 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((key) => (
                <div key={key} className="h-72 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchPage(page + 1, false)}
                disabled={loadingList}
                className="h-11 rounded-xl border border-ink-200 bg-white px-6 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
              >
                {loadingList ? 'Carregando...' : 'Ver mais produtos'}
              </button>
            </div>
          )}
        </section>
        )}
          </>
        )}
      </main>

      <StorefrontFooter
        storeName={store.storeName}
        logo={store.logo}
        bio={store.bio}
        onShopAll={() => applyFilter(null)}
        shopLinks={[
          { label: 'Início', onClick: clearSearch },
          ...(hasOffers ? [{ label: 'Ofertas', onClick: () => goSection(SECTION_IDS.offers) }] : []),
          ...(hasNew ? [{ label: 'Novidades', onClick: () => goSection(SECTION_IDS.newArrivals) }] : []),
          { label: 'Todos os produtos', onClick: () => applyFilter(null) },
        ]}
        categoryLinks={footerCategories.map((category) => ({
          label: category.name,
          onClick: () => applyFilter({ type: category.type, id: category.id }),
        }))}
        acceptedPaymentMethods={store.acceptedPaymentMethods}
        hideBranding={store.hideBranding}
      />

      <PrivacyNotice />

      {cartOpen && (
        <CartPanel
          handle={handle}
          storeName={store.storeName}
          acceptedPaymentMethods={store.acceptedPaymentMethods}
          cart={cart}
          cartTotal={cartTotal}
          cep={cep}
          onChangeQuantity={changeQuantity}
          onClose={() => setCartOpen(false)}
          onOrdered={(order) => {
            setCustomerName(readSavedCustomer()?.name ?? order.customerName);
            setCart([]);
            setReceipt(order);
          }}
        />
      )}

      {favoritesOpen && (
        <FavoritesPanel
          favorites={favorites}
          quantityInCart={quantityInCart}
          onAdd={addToCart}
          onRemove={toggleFavorite}
          onOpenProduct={openProduct}
          onClose={() => setFavoritesOpen(false)}
        />
      )}

      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function CartPanel({
  handle,
  storeName,
  acceptedPaymentMethods,
  cart,
  cartTotal,
  cep,
  onChangeQuantity,
  onClose,
  onOrdered,
}: {
  handle: string;
  storeName: string;
  acceptedPaymentMethods: NewSalePaymentMethod[];
  cart: CartLine[];
  cartTotal: number;
  cep: VisitorCep | null;
  onChangeQuantity: (productId: string, delta: number) => void;
  onClose: () => void;
  onOrdered: (order: OnlineOrderReceipt) => void;
}) {
  const { loading, run } = useSubmitting();
  const attempt = useRef(createSaleAttemptTracker(newRequestId)).current;

  const methods = PAYMENT_CHIPS.filter((chip) => acceptedPaymentMethods.includes(chip.method));

  // O painel só existe no navegador (abre por clique), então ler o localStorage aqui não causa
  // diferença entre o HTML do servidor e o do cliente.
  const [saved, setSaved] = useState<SavedCustomer | null>(() => readSavedCustomer());
  const savedPayment = saved && methods.some((m) => m.method === saved.paymentMethod) ? saved.paymentMethod : null;

  const [name, setName] = useState(saved?.name ?? '');
  const [whatsapp, setWhatsapp] = useState(saved?.whatsapp ?? '');
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>(saved?.fulfillment ?? 'pickup');
  // Sem endereço salvo, parte do CEP informado no cabeçalho (o cliente completa com número e complemento).
  const [address, setAddress] = useState(saved?.address || (cep ? addressFromCep(cep) : ''));
  const [paymentMethod, setPaymentMethod] = useState<NewSalePaymentMethod>(savedPayment ?? methods[0]?.method ?? 'pix');
  // Entrega paga em dinheiro: o cliente diz se precisa de troco e para quanto.
  const [needsChange, setNeedsChange] = useState<boolean | null>(null);
  const [changeFor, setChangeFor] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cupom: o cliente digita o código e o SERVIDOR calcula o desconto (com os preços da loja). O que
  // aparece aqui é só o resultado da conferência; o pedido confere de novo ao gravar.
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const couponSeq = useRef(0);
  // Quanto o cliente paga: o total já com o desconto do cupom, quando há.
  const payable = coupon ? coupon.total : cartTotal;

  const cartItems = useMemo(
    () => cart.map((line) => ({ storeProductId: line.product.id, quantity: line.quantity })),
    [cart],
  );
  // Muda quando o carrinho muda (produto ou quantidade): o desconto conferido deixa de valer.
  const cartSignature = cartItems.map((item) => `${item.storeProductId}:${item.quantity}`).sort().join('|');

  async function applyCoupon(code: string) {
    const seq = ++couponSeq.current;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const preview = await previewCoupon(handle, { code, items: cartItems });
      if (seq !== couponSeq.current) return;
      setCoupon(preview);
      setCouponInput('');
    } catch (err) {
      if (seq !== couponSeq.current) return;
      setCoupon(null);
      setCouponError(getErrorMessage(err));
    } finally {
      if (seq === couponSeq.current) setCouponLoading(false);
    }
  }

  function removeCoupon() {
    couponSeq.current += 1;
    setCoupon(null);
    setCouponError(null);
    setCouponLoading(false);
  }

  // O carrinho mudou com um cupom aplicado: confere de novo (o mínimo e o valor podem ter mudado).
  const appliedCode = coupon?.code ?? null;
  useEffect(() => {
    if (!appliedCode) return;
    // Carrinho esvaziado: não há o que conferir, o cupom sai.
    if (cartItems.length === 0) return removeCoupon();
    void applyCoupon(appliedCode);
    // só reage à mudança do carrinho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

  const isDelivery = fulfillment === 'delivery';
  const askChange = isDelivery && paymentMethod === 'cash';

  function forgetSavedData() {
    writeSavedCustomer(null);
    setSaved(null);
    setName('');
    setWhatsapp('');
    setAddress('');
    setFulfillment('pickup');
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const customerName = name.trim();
    const digits = whatsapp.replace(/\D/g, '');
    const deliveryAddress = address.trim();
    if (cart.length === 0) return setError('Seu carrinho está vazio.');
    if (!customerName) return setError('Informe seu nome.');
    if (!isValidWhatsapp(whatsapp)) return setError('Informe seu WhatsApp com DDD, para a loja falar com você.');
    if (isDelivery && deliveryAddress.length < ADDRESS_MIN) {
      return setError('Informe o endereço de entrega completo (rua, número e bairro).');
    }

    // Troco: só na entrega paga em dinheiro. "Não preciso" não manda nada; "preciso" exige o valor.
    let cashChangeFor: number | undefined;
    if (askChange) {
      if (needsChange === null) return setError('Diga se você precisa de troco.');
      if (needsChange) {
        const value = parsePriceInput(changeFor);
        if (value === null || value <= 0) return setError('Informe para quanto você precisa de troco (ex.: 100,00).');
        if (value < payable) {
          return setError(`O troco precisa ser para um valor igual ou maior que o total (${formatCurrency(payable)}).`);
        }
        cashChangeFor = value;
      }
    }

    const items = cart.map((line) => ({ storeProductId: line.product.id, quantity: line.quantity }));
    const content = {
      customerName,
      customerWhatsapp: digits,
      fulfillment,
      ...(isDelivery ? { deliveryAddress } : {}),
      paymentMethod,
      ...(cashChangeFor !== undefined ? { cashChangeFor } : {}),
      ...(coupon ? { couponCode: coupon.code } : {}),
      items,
    };

    void run(async () => {
      try {
        const clientRequestId = attempt.idFor(
          saleContentKey({
            ...content,
            customerName: `${customerName}|${digits}|${fulfillment}|${deliveryAddress}|${cashChangeFor ?? ''}|${coupon?.code ?? ''}`,
          }),
        );
        const order = await createStorefrontOrder(handle, { clientRequestId, ...content });
        attempt.reset();
        // Pedido feito: guarda os dados para a próxima compra não pedir tudo de novo.
        writeSavedCustomer({
          name: customerName,
          whatsapp,
          fulfillment,
          address: deliveryAddress || saved?.address || '',
          paymentMethod,
        });
        onClose();
        onOrdered(order);
      } catch (err) {
        if (isDefinitiveRejection(err)) attempt.reset();
        // O servidor recusou o cupom (venceu, esgotou...): tira da tela para o cliente seguir sem ele.
        if (isApiError(err) && err.code === 'COUPON_INVALID') removeCoupon();
        setError(getErrorMessage(err));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink-900/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Carrinho"
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div className="leading-tight">
            <h2 className="text-base font-semibold text-ink-900">Seu pedido</h2>
            <p className="text-xs text-ink-400">{storeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar carrinho"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Icon name="basket" size={34} className="text-ink-300" />
                <p className="mt-3 text-sm font-semibold text-ink-500">Carrinho vazio</p>
                <p className="mt-1 text-xs text-ink-400">Adicione produtos para fazer seu pedido.</p>
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-2.5">
                  {cart.map((line) => (
                    <li key={line.product.id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                        {line.product.imageSm || line.product.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={line.product.imageSm ?? line.product.image ?? ''} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <Icon name="box" size={18} className="text-ink-300" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[13px] font-semibold text-ink-900">{line.product.name}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">{formatCurrency(unitPrice(line.product))}</span>
                      </span>
                      <span className="flex items-center rounded-full bg-ink-50">
                        <button
                          type="button"
                          onClick={() => onChangeQuantity(line.product.id, -1)}
                          aria-label={`Diminuir ${line.product.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
                        >
                          <Icon name="minus" size={14} strokeWidth={2.4} />
                        </button>
                        <span className="min-w-6 text-center text-sm font-bold text-ink-900">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => onChangeQuantity(line.product.id, 1)}
                          disabled={line.quantity >= MAX_QUANTITY}
                          aria-label={`Aumentar ${line.product.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40"
                        >
                          <Icon name="plus" size={14} strokeWidth={2.4} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-col gap-3">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-ink-600">Cupom de desconto</p>
                    {coupon ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft px-3 py-2.5">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-success">
                          <Icon name="ticket" size={16} className="shrink-0" />
                          <span className="truncate">{coupon.code}</span>
                          <span className="shrink-0 font-medium">−{formatCurrency(coupon.discount)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={removeCoupon}
                          disabled={loading}
                          aria-label={`Remover cupom ${coupon.code}`}
                          className="shrink-0 text-xs font-semibold text-ink-500 underline hover:text-ink-700"
                        >
                          Remover
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          value={couponInput}
                          onChange={(event) => {
                            setCouponInput(event.target.value.toUpperCase().replace(/\s/g, ''));
                            setCouponError(null);
                          }}
                          onKeyDown={(event) => {
                            // Enter aqui aplica o cupom, em vez de enviar o pedido inteiro.
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              if (couponInput.length > 0 && !couponLoading) void applyCoupon(couponInput);
                            }
                          }}
                          maxLength={40}
                          placeholder="Digite o código"
                          aria-label="Código do cupom"
                          disabled={loading || couponLoading}
                          autoCapitalize="characters"
                          className="h-11 min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 text-sm uppercase text-ink-900 outline-none transition placeholder:normal-case placeholder:text-ink-400 focus:border-primary-500"
                        />
                        <button
                          type="button"
                          onClick={() => void applyCoupon(couponInput)}
                          disabled={loading || couponLoading || couponInput.length === 0}
                          className="h-11 shrink-0 rounded-xl border border-ink-200 px-4 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {couponLoading ? 'Conferindo...' : 'Aplicar'}
                        </button>
                      </div>
                    )}
                    {couponError && (
                      <p role="alert" className="mt-1.5 text-xs text-danger">
                        {couponError}
                      </p>
                    )}
                  </div>
                  {saved && (
                    <p className="flex items-center justify-between gap-3 rounded-xl bg-primary-50 px-3 py-2.5 text-xs text-primary-700">
                      <span>Preenchemos com os dados do seu último pedido.</span>
                      <button type="button" onClick={forgetSavedData} className="shrink-0 font-semibold underline">
                        Limpar
                      </button>
                    </p>
                  )}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-ink-600">Seu nome</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={NAME_MAX}
                      placeholder="Ex: Ana Souza"
                      disabled={loading}
                      autoComplete="name"
                      className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-ink-600">Seu WhatsApp</span>
                    <input
                      value={whatsapp}
                      onChange={(event) => setWhatsapp(maskWhatsapp(event.target.value, whatsapp))}
                      inputMode="tel"
                      placeholder="(11) 98221-4432"
                      disabled={loading}
                      autoComplete="tel"
                      className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-500"
                    />
                    <span className="mt-1.5 block text-xs text-ink-400">A loja chama você por aqui para combinar o pagamento.</span>
                  </label>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-ink-600">Como você quer receber?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: 'pickup', label: 'Retirada', hint: 'Busco na loja', icon: 'store' },
                          { key: 'delivery', label: 'Entrega', hint: 'Entregam pra mim', icon: 'car' },
                        ] as const
                      ).map((option) => {
                        const active = fulfillment === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setFulfillment(option.key)}
                            disabled={loading}
                            aria-pressed={active}
                            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60 ${
                              active
                                ? 'border-primary-500 bg-primary-50 text-primary-700'
                                : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                            }`}
                          >
                            <Icon name={option.icon} size={18} />
                            <span className="leading-tight">
                              <span className="block text-xs font-semibold">{option.label}</span>
                              <span className="block text-[11px] opacity-70">{option.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isDelivery && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-ink-600">Endereço de entrega</span>
                      <textarea
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        maxLength={ADDRESS_MAX}
                        rows={3}
                        placeholder="Rua, número, bairro, complemento e ponto de referência"
                        disabled={loading}
                        autoComplete="street-address"
                        className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-500"
                      />
                      <span className="mt-1 block text-xs text-ink-400">A loja combina a taxa de entrega com você pelo WhatsApp.</span>
                    </label>
                  )}

                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-ink-600">Forma de pagamento</p>
                    <div className="flex flex-wrap gap-2">
                      {methods.map(({ method, label }) => {
                        const active = method === paymentMethod;
                        return (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPaymentMethod(method)}
                            disabled={loading}
                            aria-pressed={active}
                            className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition disabled:opacity-60 ${
                              active ? 'bg-primary-500 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                            }`}
                          >
                            <Icon name={PAYMENT_ICON[method]} size={15} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {askChange && (
                    <div className="rounded-xl bg-ink-50 p-3">
                      <p className="mb-2 text-xs font-semibold text-ink-600">Você precisa de troco?</p>
                      <div className="flex gap-2">
                        {(
                          [
                            { value: false, label: 'Não, tenho o valor certo' },
                            { value: true, label: 'Sim, preciso de troco' },
                          ] as const
                        ).map((option) => {
                          const active = needsChange === option.value;
                          return (
                            <button
                              key={String(option.value)}
                              type="button"
                              onClick={() => setNeedsChange(option.value)}
                              disabled={loading}
                              aria-pressed={active}
                              className={`h-10 flex-1 rounded-full px-3 text-xs font-semibold transition disabled:opacity-60 ${
                                active ? 'bg-primary-500 text-white' : 'bg-white text-ink-600 hover:bg-ink-100'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      {needsChange === true && (
                        <div className="mt-3">
                          <MoneyField
                            label="Troco para quanto?"
                            hint={`O total é ${formatCurrency(payable)}. Informe a nota que você vai entregar.`}
                            value={changeFor}
                            onChange={setChangeFor}
                            disabled={loading}
                            placeholder="100,00"
                          />
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </>
            )}
          </div>

          <div className="border-t border-ink-100 px-5 py-4">
            {error && (
              <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-3 text-xs font-medium text-danger">
                {error}
              </p>
            )}
            {coupon && (
              <div className="mb-2 flex flex-col gap-1 text-sm">
                <p className="flex items-center justify-between text-ink-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(coupon.subtotal)}</span>
                </p>
                <p className="flex items-center justify-between text-success">
                  <span>Cupom {coupon.code}</span>
                  <span>−{formatCurrency(coupon.discount)}</span>
                </p>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-ink-500">Total</span>
              <span className="text-xl font-extrabold text-ink-900">{formatCurrency(payable)}</span>
            </div>
            <button
              type="submit"
              disabled={loading || cart.length === 0}
              className="h-12 w-full rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Enviando pedido...' : 'Finalizar pedido'}
            </button>
            <p className="mt-2.5 text-center text-[11px] leading-snug text-ink-400">
              Seus dados vão para a loja combinar pagamento e entrega e ficam salvos neste aparelho para o próximo pedido.{' '}
              <a href={platformUrl('/privacidade')} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Privacidade
              </a>
            </p>
          </div>
        </form>
      </aside>
    </div>
  );
}

function ReceiptModal({ receipt, onClose }: { receipt: OnlineOrderReceipt; onClose: () => void }) {
  const expires = new Date(receipt.expiresAt);
  const expiresLabel = `${expires.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${expires.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/50 p-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-label="Pedido enviado">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
            <Icon name="check" size={26} strokeWidth={2.6} />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-ink-900">Pedido #{receipt.number} enviado!</h2>
          <p className="mt-1 text-sm text-ink-500">
            Obrigada, {receipt.customerName.split(' ')[0]}. A loja vai falar com você pelo WhatsApp para combinar o pagamento.
          </p>
        </div>

        <ul className="mt-5 flex flex-col gap-1.5 rounded-xl bg-ink-50 p-4 text-sm">
          {receipt.items.map((item, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-ink-700">
                {item.quantity}× {item.productName}
              </span>
              <span className="shrink-0 font-semibold text-ink-900">{formatCurrency(item.subtotal)}</span>
            </li>
          ))}
          {receipt.discount > 0 && (
            <li className="flex items-center justify-between text-success">
              <span>Cupom {receipt.couponCode}</span>
              <span className="font-semibold">−{formatCurrency(receipt.discount)}</span>
            </li>
          )}
          <li className="mt-1.5 flex items-center justify-between border-t border-ink-200 pt-2.5">
            <span className="text-ink-500">Total</span>
            <span className="text-base font-extrabold text-ink-900">{formatCurrency(receipt.total)}</span>
          </li>
        </ul>

        <div className="mt-3 rounded-xl bg-ink-50 p-4 text-sm">
          {receipt.fulfillment === 'delivery' ? (
            <>
              <p className="font-semibold text-ink-900">Entrega</p>
              <p className="mt-0.5 whitespace-pre-line break-words text-ink-600">{receipt.deliveryAddress}</p>
              <p className="mt-1.5 text-xs text-ink-400">A loja combina a taxa de entrega com você pelo WhatsApp.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink-900">Retirada na loja</p>
              <p className="mt-0.5 text-xs text-ink-400">A loja avisa você pelo WhatsApp quando o pedido estiver pronto.</p>
            </>
          )}
          {receipt.cashChangeFor !== null && (
            <p className="mt-2.5 border-t border-ink-200 pt-2.5 text-ink-700">
              Troco para <span className="font-semibold">{formatCurrency(receipt.cashChangeFor)}</span>{' '}
              <span className="text-ink-400">(troco de {formatCurrency(roundMoney(receipt.cashChangeFor - receipt.total))})</span>
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-ink-400">
          O pedido fica reservado para você até {expiresLabel}. Depois disso ele é cancelado sozinho.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600"
        >
          Continuar comprando
        </button>
      </div>
    </div>
  );
}
