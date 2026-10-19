'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSale } from '@/lib/api/sales';
import { listStoreProducts } from '@/lib/api/storeProducts';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { CreateSaleInput, NewSalePaymentMethod, StoreProduct } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils/format';
import { createSaleAttemptTracker, isDefinitiveRejection, saleContentKey } from '@/lib/utils/saleAttempt';
import { PAYMENT_CHIPS, PAYMENT_ICON, roundMoney } from '@/lib/utils/sales';
import { newRequestId } from '@/lib/utils/uuid';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSubmitting } from '@/hooks/useSubmitting';
import { Icon } from '@/components/dashboard/icons';
import { Banner, Field, PageHeader, TextInput } from '@/components/products/FormParts';

type CartLine = { item: StoreProduct; quantity: number };

const CUSTOMER_NAME_MAX = 120;
const MAX_INSTALLMENTS = 24;
const MAX_CART_ITEMS = 50;
const SEARCH_DEBOUNCE_MS = 350;
const RESULTS_LIMIT = 6;

export default function NewSalePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { loading, run } = useSubmitting();

  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<NewSalePaymentMethod>('pix');
  const [installments, setInstallments] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Busca de produto (nome ou código de barras): a mesma pesquisa do servidor, com debounce na digitação.
  const [productQuery, setProductQuery] = useState('');
  const term = useDebouncedValue(productQuery.trim(), SEARCH_DEBOUNCE_MS);

  // clientRequestId da venda: acompanha a tentativa (ver saleAttempt.ts) — sobrevive a re-renders
  // sem recriar a cada digitação.
  const attempt = useRef(createSaleAttemptTracker(newRequestId)).current;

  const searchQuery = useQuery({
    queryKey: queryKeys.storeProducts({ sale: true, term }),
    queryFn: () => listStoreProducts(1, { search: term, pageSize: RESULTS_LIMIT }),
    enabled: term.length > 0,
  });
  const results = term ? (searchQuery.data?.items ?? []) : [];
  const searching = term.length > 0 && searchQuery.isFetching;
  const searchError = searchQuery.isError ? getErrorMessage(searchQuery.error) : null;

  const total = roundMoney(cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0));
  const cartTotalLabel = useMemo(() => formatCurrency(total), [total]);

  function addToCart(item: StoreProduct) {
    if (item.stock <= 0) {
      setFormError(`"${item.product.name}" está esgotado.`);
      return;
    }
    const existing = cart.find((line) => line.item.id === item.id);
    if (!existing && cart.length >= MAX_CART_ITEMS) {
      setFormError(`Uma venda aceita até ${MAX_CART_ITEMS} produtos diferentes.`);
      return;
    }
    setFormError(null);
    setCart((current) =>
      existing
        ? current.map((line) =>
            line.item.id === item.id ? { ...line, quantity: Math.min(item.stock, line.quantity + 1) } : line,
          )
        : [...current, { item, quantity: 1 }],
    );
    setProductQuery('');
  }

  function changeQuantity(line: CartLine, delta: number) {
    setFormError(null);
    setCart((current) =>
      current
        .map((entry) => (entry === line ? { ...entry, quantity: Math.min(entry.item.stock, entry.quantity + delta) } : entry))
        .filter((entry) => entry.quantity > 0),
    );
  }

  // Enter com um único resultado na tela (ex.: leitor de código de barras USB, que digita rápido e
  // manda Enter): adiciona direto, sem esperar o clique.
  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (results.length === 1) addToCart(results[0]);
  }

  function resetForm() {
    setCustomerName('');
    setPaymentMethod('pix');
    setInstallments(1);
    setCart([]);
    setProductQuery('');
    setNameError(null);
    setFormError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const name = customerName.trim();
    if (!name || name.length > CUSTOMER_NAME_MAX) {
      setNameError(`Informe o nome do cliente (até ${CUSTOMER_NAME_MAX} caracteres).`);
      return;
    }
    setNameError(null);
    if (cart.length === 0) {
      setFormError('Adicione ao menos um produto à venda.');
      return;
    }
    const overStock = cart.find((line) => line.quantity > line.item.stock);
    if (overStock) {
      setFormError(`Estoque insuficiente para "${overStock.item.product.name}": disponível ${overStock.item.stock}.`);
      return;
    }

    // O servidor usa o preço atual do produto e define o status pelo pagamento — não enviamos preço nem status.
    const content: Omit<CreateSaleInput, 'clientRequestId'> = {
      customerName: name,
      paymentMethod,
      ...(paymentMethod === 'card' ? { installments } : {}),
      items: cart.map((line) => ({ storeProductId: line.item.id, quantity: line.quantity })),
    };

    void run(async () => {
      try {
        // Mesma venda, nova tentativa (rede/timeout/duplo clique) → mesmo id; venda diferente → id novo.
        const clientRequestId = attempt.idFor(saleContentKey(content));
        await createSale({ clientRequestId, ...content });
        attempt.reset();

        // Finanças, Início e o estoque mostrado em Produtos mudam com essa venda.
        void queryClient.invalidateQueries({ queryKey: queryKeys.sales() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() });
        resetForm();
        router.push('/vendas');
      } catch (error) {
        // 400/404/409: o servidor recusou (nada foi gravado) → id novo no reenvio. Rede/timeout/5xx:
        // pode ter gravado → o retry reaproveita o mesmo id.
        if (isDefinitiveRejection(error)) attempt.reset();
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <div className="w-full pb-24">
      <PageHeader title="Nova venda" backHref="/vendas" />

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3" noValidate>
        <div className="flex flex-col gap-4 lg:col-span-2">
          {formError && <Banner type="error" message={formError} />}

          <section className="rounded-2xl border border-ink-100 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink-900">Cliente e pagamento</h2>

            <Field label="Nome do cliente" error={nameError}>
              <TextInput
                value={customerName}
                onChange={(value) => {
                  setCustomerName(value);
                  if (nameError) setNameError(null);
                }}
                error={nameError}
                placeholder="Ex: Ana Souza"
                maxLength={CUSTOMER_NAME_MAX}
                disabled={loading}
                aria-label="Nome do cliente"
              />
            </Field>

            <p className="mb-1.5 mt-4 text-xs font-semibold text-ink-600">Forma de pagamento</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_CHIPS.map(({ method, label }) => {
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

            {paymentMethod === 'card' && (
              <div className="mt-3 flex h-12 items-center justify-between rounded-xl bg-ink-50 px-4">
                <span className="text-sm text-ink-700">Parcelas</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setInstallments((value) => Math.max(1, value - 1))}
                    disabled={installments <= 1 || loading}
                    aria-label="Diminuir parcelas"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 transition hover:bg-ink-100 disabled:opacity-40"
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
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:opacity-40"
                  >
                    <Icon name="plus" size={14} strokeWidth={2.4} />
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="relative rounded-2xl border border-ink-100 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Adicionar produto</h2>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 transition focus-within:border-primary-500">
              <Icon name="barcode" size={17} className="text-ink-400" />
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Nome ou código de barras"
                disabled={loading}
                aria-label="Buscar produto por nome ou código de barras"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
              />
              {searching && <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ink-200 border-t-primary-500" />}
              {productQuery.length > 0 && !searching && (
                <button
                  type="button"
                  onClick={() => setProductQuery('')}
                  aria-label="Limpar busca"
                  className="text-ink-300 transition hover:text-ink-600"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </label>

            {term.length > 0 && (
              <div className="animate-fade-up absolute inset-x-5 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-ink-100 bg-white shadow-lg">
                {searchError ? (
                  <p className="px-4 py-3 text-xs text-danger">{searchError}</p>
                ) : results.length === 0 && !searching ? (
                  <p className="px-4 py-3 text-xs text-ink-400">Nenhum produto da sua loja encontrado.</p>
                ) : (
                  results.map((item, index) => {
                    const outOfStock = item.stock <= 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addToCart(item)}
                        disabled={outOfStock}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-primary-50/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                          index > 0 ? 'border-t border-ink-100' : ''
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                          {item.product.productImageSm ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.product.productImageSm} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Icon name="box" size={16} className="text-primary-500" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink-900">{item.product.name}</span>
                          <span className="block text-xs text-ink-400">
                            {formatCurrency(item.price)} · {outOfStock ? 'Esgotado' : `Estoque: ${item.stock}`}
                          </span>
                        </span>
                        <Icon name="plus" size={18} className="shrink-0 text-primary-500" />
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {cart.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Icon name="basket" size={34} className="text-ink-300" />
                <p className="mt-3 text-sm font-semibold text-ink-500">Carrinho vazio</p>
                <p className="mt-1 max-w-xs text-xs text-ink-400">
                  Busque pelo nome ou digite o código de barras para adicionar produtos
                </p>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-2.5">
                {cart.map((line) => (
                  <li key={line.item.id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                      {line.item.product.productImageSm ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={line.item.product.productImageSm} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon name="box" size={18} className="text-primary-500" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink-900">{line.item.product.name}</span>
                      <span className="block text-xs text-ink-500">
                        {formatCurrency(line.item.price)} · Estoque: {line.item.stock}
                      </span>
                    </span>
                    <span className="flex items-center rounded-full bg-ink-50">
                      <button
                        type="button"
                        onClick={() => changeQuantity(line, -1)}
                        disabled={loading}
                        aria-label={`Diminuir ${line.item.product.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-700 transition hover:bg-ink-100"
                      >
                        <Icon name="minus" size={14} strokeWidth={2.4} />
                      </button>
                      <span className="min-w-6 text-center text-sm font-bold text-ink-900">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(line, 1)}
                        disabled={loading || line.quantity >= line.item.stock}
                        aria-label={`Aumentar ${line.item.product.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:opacity-40"
                      >
                        <Icon name="plus" size={14} strokeWidth={2.4} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="sticky top-4 rounded-2xl border border-ink-100 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Resumo</h2>
            {cart.length === 0 ? (
              <p className="text-xs text-ink-400">Nenhum produto adicionado ainda.</p>
            ) : (
              <ul className="mb-3 flex flex-col gap-1.5">
                {cart.map((line) => (
                  <li key={line.item.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-ink-600">
                      {line.quantity}× {line.item.product.name}
                    </span>
                    <span className="shrink-0 font-semibold text-ink-900">
                      {formatCurrency(roundMoney(line.item.price * line.quantity))}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-ink-100 pt-3">
              <span className="text-sm text-ink-500">Total</span>
              <span className="text-xl font-extrabold text-ink-900">{cartTotalLabel}</span>
            </div>

            <button
              type="submit"
              disabled={loading || cart.length === 0}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Finalizando...' : 'Finalizar venda'}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
}
