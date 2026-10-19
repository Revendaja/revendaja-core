'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createStorefrontOrder,
  getStorefront,
  recordStorefrontVisit,
  STOREFRONT_PAGE_SIZE,
  type StorefrontFilter,
} from '@/lib/api/public';
import { getErrorMessage } from '@/lib/api/errors';
import type {
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
  collectionLinkImage,
  collectionProducts,
  maxDiscount,
  pickImages,
  resolveLink,
  scrollToSection,
} from '@/lib/storefront/home';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSubmitting } from '@/hooks/useSubmitting';
import { Icon } from '@/components/dashboard/icons';
import { MoneyField } from '@/components/products/FormParts';
import { BenefitsStrip } from '@/components/storefront/BenefitsStrip';
import { CategoryShelf } from '@/components/storefront/CategoryShelf';
import { CollectionBanners, type CollectionView } from '@/components/storefront/CollectionBanners';
import { FlashSale } from '@/components/storefront/FlashSale';
import { HeroBanner } from '@/components/storefront/HeroBanner';
import { ProductGrid, SectionHeader, unitPrice } from '@/components/storefront/ProductCard';
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter';
import { StorefrontHeader, type NavSection } from '@/components/storefront/StorefrontHeader';

type CartLine = { product: StorefrontProduct; quantity: number };

const MAX_CART_ITEMS = 50;
const MAX_QUANTITY = 99;
const MAX_INSTALLMENTS = 12;
const NAME_MAX = 120;
const ADDRESS_MIN = 8;
const ADDRESS_MAX = 300;

// Dados do cliente guardados neste aparelho depois do primeiro pedido, para ele não digitar tudo de
// novo. Fica só no localStorage do navegador (nunca vai para o servidor por conta própria) e a
// vitrine de cada loja tem o seu (cada subdomínio é uma origem separada). O troco NÃO é guardado:
// vale só para aquele pedido.
const CUSTOMER_KEY = 'revendaja.customer';

type SavedCustomer = {
  name: string;
  whatsapp: string;
  fulfillment: FulfillmentMethod;
  address: string;
  paymentMethod: NewSalePaymentMethod;
};

function readSavedCustomer(): SavedCustomer | null {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedCustomer>;
    if (typeof data.name !== 'string' || typeof data.whatsapp !== 'string') return null;
    return {
      name: data.name,
      whatsapp: data.whatsapp,
      fulfillment: data.fulfillment === 'delivery' ? 'delivery' : 'pickup',
      address: typeof data.address === 'string' ? data.address : '',
      paymentMethod: data.paymentMethod === 'card' || data.paymentMethod === 'cash' ? data.paymentMethod : 'pix',
    };
  } catch {
    return null;
  }
}

function writeSavedCustomer(customer: SavedCustomer | null) {
  try {
    if (customer) window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
    else window.localStorage.removeItem(CUSTOMER_KEY);
  } catch {
    // localStorage indisponível (modo privado, cota cheia): o pedido segue normal, só não lembra dos dados.
  }
}

export function StorefrontView({ initial, home }: { initial: Storefront; home: StorefrontHome }) {
  const { store, config } = home;
  const handle = store.handle;
  const cartKey = `revendaja.cart.${handle}`;

  const [products, setProducts] = useState(initial.products.items);
  const [total, setTotal] = useState(initial.products.total);
  const [page, setPage] = useState(initial.products.page);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query.trim(), 350);
  // Atalho de categoria/marca escolhido (null = todos os produtos).
  const [filter, setFilter] = useState<StorefrontFilter>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [receipt, setReceipt] = useState<OnlineOrderReceipt | null>(null);

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

  // Carrinho sobrevive a um F5 (só neste navegador).
  const cartLoaded = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cartKey);
      if (raw) setCart(JSON.parse(raw) as CartLine[]);
    } catch {
      // carrinho salvo ilegível: começa vazio.
    }
    cartLoaded.current = true;
  }, [cartKey]);
  useEffect(() => {
    if (!cartLoaded.current) return;
    try {
      window.localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      // sem espaço/permissão: o carrinho segue na memória.
    }
  }, [cart, cartKey]);

  // Busca/filtro: troca a lista pela primeira página. Respostas antigas são descartadas.
  const searchSeq = useRef(0);
  const firstRender = useRef(true);
  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      const seq = ++searchSeq.current;
      setLoadingList(true);
      setListError(null);
      try {
        const data = await getStorefront(handle, { search: term, filter, page: nextPage, pageSize: STOREFRONT_PAGE_SIZE });
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
    [handle, term, filter],
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

  function addToCart(product: StorefrontProduct) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) } : line,
        );
      }
      if (current.length >= MAX_CART_ITEMS) return current;
      return [...current, { product, quantity: 1 }];
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
  function applyFilter(next: StorefrontFilter) {
    setFilter(next);
    setQuery('');
    scrollToSection(SECTION_IDS.catalog);
  }

  function changeQuery(value: string) {
    setQuery(value);
    // Quem busca quer ver o resultado: a busca anda junto com a lista de produtos.
    if (value.trim()) scrollToSection(SECTION_IDS.catalog);
  }

  const quantityInCart = useMemo(() => new Map(cart.map((line) => [line.product.id, line.quantity])), [cart]);
  const hasMore = products.length < total;

  const hasOffers = home.offers.products.length > 0;
  const hasNew = home.newArrivals.length > 0;
  // Numa loja pequena os destaques já são o catálogo inteiro: repetir a lista logo abaixo só polui.
  const hasFeatured = home.featured.length > 0 && initial.products.total > home.featured.length;
  const hasCategories = home.categories.length > 0;
  const hasAnyProduct = initial.products.total > 0;
  const discount = maxDiscount(home.offers.products);
  const activeFilterName = filter
    ? home.categories.find((category) => category.type === filter.type && category.id === filter.id)?.name ?? null
    : null;

  const navSections: NavSection[] = [
    { id: SECTION_IDS.top, label: 'Início' },
    ...(hasCategories ? [{ id: SECTION_IDS.categories, label: 'Categorias' }] : []),
    ...(hasOffers ? [{ id: SECTION_IDS.offers, label: 'Ofertas' }] : []),
    ...(hasNew ? [{ id: SECTION_IDS.newArrivals, label: 'Novidades' }] : []),
    ...(hasAnyProduct ? [{ id: SECTION_IDS.catalog, label: 'Todos os produtos' }] : []),
  ];

  const heroImages = pickImages([...home.featured, ...home.newArrivals, ...home.offers.products], 4);
  const flashImages = pickImages(home.offers.products, 3);

  const existingSections = new Set<string>([
    SECTION_IDS.catalog,
    ...(hasFeatured ? [SECTION_IDS.featured] : []),
    ...(hasOffers ? [SECTION_IDS.offers] : []),
    ...(hasNew ? [SECTION_IDS.newArrivals] : []),
  ]);

  const collections: CollectionView[] = config.collections.map((collection) => {
    const target = resolveLink(collection.link);
    const linkImage = collectionLinkImage(collection.link, home.categories);
    const images = linkImage ? [linkImage] : pickImages(collectionProducts(collection.link, home), 3);
    return {
      collection,
      images,
      onOpen: () => {
        if (target.kind === 'filter') return applyFilter(target.filter);
        // Seção que não existe nesta loja (sem ofertas, sem novidades...): leva ao catálogo.
        scrollToSection(existingSections.has(target.id) ? target.id : SECTION_IDS.catalog);
      },
    };
  });

  return (
    <div className="min-h-screen bg-ink-50 pb-24 sm:pb-0">
      <StorefrontHeader
        storeName={store.storeName}
        announcement={config.announcement}
        acceptedPaymentMethods={store.acceptedPaymentMethods}
        sections={navSections}
        query={query}
        onQueryChange={changeQuery}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
      />

      <main id={SECTION_IDS.top} className="mx-auto flex max-w-6xl scroll-mt-28 flex-col gap-10 px-4 pt-5">
        <HeroBanner
          hero={config.hero}
          images={heroImages}
          maxDiscount={discount}
          productCount={initial.products.total}
          hasOffers={hasOffers}
          onPrimary={() => scrollToSection(hasAnyProduct ? SECTION_IDS.catalog : SECTION_IDS.top)}
          onSecondary={() => scrollToSection(SECTION_IDS.offers)}
        />

        <BenefitsStrip benefits={config.benefits} />

        {hasCategories && (
          <div id={SECTION_IDS.categories} className="scroll-mt-28">
            <CategoryShelf
              categories={home.categories}
              active={filter}
              onSelect={(next) => applyFilter(next)}
              onClear={() => applyFilter(null)}
            />
          </div>
        )}

        {hasFeatured && (
          <section id={SECTION_IDS.featured} aria-label="Produtos em destaque" className="scroll-mt-28">
            <SectionHeader title="Produtos em destaque" actionLabel="Ver todos os produtos" onAction={() => applyFilter(null)} />
            <ProductGrid products={home.featured} quantityInCart={quantityInCart} onAdd={addToCart} />
          </section>
        )}

        {hasOffers && (
          <div id={SECTION_IDS.offers} className="flex scroll-mt-28 flex-col gap-6">
            {config.flash.enabled && (
              <FlashSale
                flash={config.flash}
                endsAt={home.offers.endsAt}
                images={flashImages}
                maxDiscount={discount}
                onShop={() => scrollToSection(`${SECTION_IDS.offers}-lista`)}
              />
            )}
            <section id={`${SECTION_IDS.offers}-lista`} aria-label="Ofertas" className="scroll-mt-28">
              <SectionHeader title="Ofertas" />
              <ProductGrid products={home.offers.products} quantityInCart={quantityInCart} onAdd={addToCart} />
            </section>
          </div>
        )}

        {hasAnyProduct && <CollectionBanners items={collections} />}

        {hasNew && (
          <section id={SECTION_IDS.newArrivals} aria-label="Novidades" className="scroll-mt-28">
            <SectionHeader title="Novidades" actionLabel="Ver todos os produtos" onAction={() => applyFilter(null)} />
            <ProductGrid products={home.newArrivals} quantityInCart={quantityInCart} onAdd={addToCart} />
          </section>
        )}

        <section id={SECTION_IDS.catalog} aria-label="Todos os produtos" className="scroll-mt-28">
          <SectionHeader title="Todos os produtos" />

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(activeFilterName || term) && (
              <>
                {activeFilterName && (
                  <button
                    type="button"
                    onClick={() => setFilter(null)}
                    className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                    aria-label={`Remover filtro ${activeFilterName}`}
                  >
                    {activeFilterName}
                    <Icon name="close" size={13} />
                  </button>
                )}
                {term && <span className="text-xs text-ink-500">Resultados para “{term}”</span>}
              </>
            )}
            {total > 0 && (
              <span className="ml-auto text-xs text-ink-400">
                {total} {total === 1 ? 'produto' : 'produtos'}
              </span>
            )}
          </div>

          {listError && <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-xs font-medium text-danger">{listError}</p>}

          {products.length === 0 && !loadingList && !listError && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-400">
                <Icon name="box" size={24} />
              </span>
              <p className="mt-4 text-sm font-semibold text-ink-900">
                {term || filter ? 'Nenhum produto encontrado' : 'Esta loja ainda não tem produtos'}
              </p>
              {(term || filter) && <p className="mt-1 text-xs text-ink-400">Tente outra busca ou outra categoria.</p>}
            </div>
          )}

          <ProductGrid products={products} quantityInCart={quantityInCart} onAdd={addToCart} />
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
      </main>

      <StorefrontFooter
        storeName={store.storeName}
        bio={store.bio}
        acceptedPaymentMethods={store.acceptedPaymentMethods}
        hideBranding={store.hideBranding}
      />

      {cartCount > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-100 bg-white p-3 sm:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex h-12 w-full items-center justify-between rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white"
          >
            <span>Ver carrinho ({cartCount})</span>
            <span>{formatCurrency(cartTotal)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <CartPanel
          handle={handle}
          storeName={store.storeName}
          acceptedPaymentMethods={store.acceptedPaymentMethods}
          cart={cart}
          cartTotal={cartTotal}
          onChangeQuantity={changeQuantity}
          onClose={() => setCartOpen(false)}
          onOrdered={(order) => {
            setCart([]);
            setReceipt(order);
          }}
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
  onChangeQuantity,
  onClose,
  onOrdered,
}: {
  handle: string;
  storeName: string;
  acceptedPaymentMethods: NewSalePaymentMethod[];
  cart: CartLine[];
  cartTotal: number;
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
  const [address, setAddress] = useState(saved?.address ?? '');
  const [paymentMethod, setPaymentMethod] = useState<NewSalePaymentMethod>(savedPayment ?? methods[0]?.method ?? 'pix');
  const [installments, setInstallments] = useState(1);
  // Entrega paga em dinheiro: o cliente diz se precisa de troco e para quanto.
  const [needsChange, setNeedsChange] = useState<boolean | null>(null);
  const [changeFor, setChangeFor] = useState('');
  const [error, setError] = useState<string | null>(null);

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
        if (value < cartTotal) {
          return setError(`O troco precisa ser para um valor igual ou maior que o total (${formatCurrency(cartTotal)}).`);
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
      ...(paymentMethod === 'card' ? { installments } : {}),
      ...(cashChangeFor !== undefined ? { cashChangeFor } : {}),
      items,
    };

    void run(async () => {
      try {
        const clientRequestId = attempt.idFor(
          saleContentKey({
            ...content,
            customerName: `${customerName}|${digits}|${fulfillment}|${deliveryAddress}|${cashChangeFor ?? ''}`,
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
                            hint={`O total é ${formatCurrency(cartTotal)}. Informe a nota que você vai entregar.`}
                            value={changeFor}
                            onChange={setChangeFor}
                            disabled={loading}
                            placeholder="100,00"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {paymentMethod === 'card' && (
                    <div className="flex h-12 items-center justify-between rounded-xl bg-ink-50 px-4">
                      <span className="text-sm text-ink-700">Parcelas</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInstallments((value) => Math.max(1, value - 1))}
                          disabled={installments <= 1 || loading}
                          aria-label="Diminuir parcelas"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100 disabled:opacity-40"
                        >
                          <Icon name="minus" size={14} strokeWidth={2.4} />
                        </button>
                        <span className="min-w-16 text-center text-sm font-bold text-ink-900">
                          {installments === 1 ? 'à vista' : `${installments}x`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInstallments((value) => Math.min(MAX_INSTALLMENTS, value + 1))}
                          disabled={installments >= MAX_INSTALLMENTS || loading}
                          aria-label="Aumentar parcelas"
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40"
                        >
                          <Icon name="plus" size={14} strokeWidth={2.4} />
                        </button>
                      </div>
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
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-ink-500">Total</span>
              <span className="text-xl font-extrabold text-ink-900">{formatCurrency(cartTotal)}</span>
            </div>
            <button
              type="submit"
              disabled={loading || cart.length === 0}
              className="h-12 w-full rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Enviando pedido...' : 'Finalizar pedido'}
            </button>
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
