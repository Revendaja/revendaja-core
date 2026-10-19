'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCatalogProduct } from '@/lib/api/catalog';
import { addStoreProduct } from '@/lib/api/storeProducts';
import { queryKeys } from '@/lib/api/queryKeys';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import type { CatalogProduct } from '@/lib/api/types';
import {
  PRICE_ERROR_MESSAGE,
  STOCK_ERROR_MESSAGE,
  formatCurrency,
  formatPriceInput,
  hasSuggestedPrice,
  parsePriceInput,
  parseStockInput,
} from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';
import { Banner, MoneyField, PageHeader, StockField, SubmitButton } from '@/components/products/FormParts';

export default function AddCatalogProductPage() {
  const params = useParams<{ productId: string }>();
  const productId = Number(params.productId);
  const validId = Number.isInteger(productId) && productId > 0;

  const productQuery = useQuery({
    queryKey: queryKeys.catalogProduct(productId),
    queryFn: () => getCatalogProduct(productId),
    enabled: validId,
  });
  const product = productQuery.data;

  return (
    <div className="w-full">
      <PageHeader title="Novo produto" subtitle="Adicionar do catálogo" backHref="/produtos/novo" />

      {productQuery.isPending && validId && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl border border-ink-100 bg-ink-50 lg:col-span-2" />
          <div className="h-40 animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />
        </div>
      )}

      {(!validId || productQuery.isError) && (
        <div className="rounded-2xl border border-ink-100 p-10 text-center">
          <p className="mb-3 text-sm font-medium text-danger">
            {!validId ? 'Produto não encontrado no catálogo.' : getErrorMessage(productQuery.error)}
          </p>
          <Link
            href="/produtos/novo"
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Voltar ao catálogo
          </Link>
        </div>
      )}

      {product && <AddForm key={product.id} product={product} />}
    </div>
  );
}

function AddForm({ product }: { product: CatalogProduct }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const suggested = hasSuggestedPrice(product.basePrice);

  // Sugere o preço do catálogo só quando ele existe (basePrice = 0 → o campo começa vazio).
  const [price, setPrice] = useState(suggested ? formatPriceInput(product.basePrice) : '');
  // Custo é opcional: vazio = "não informado". 0 é um custo válido.
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyAdded, setAlreadyAdded] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: { price: number; stock: number; costPrice?: number }) =>
      addStoreProduct({ productId: product.id, ...input }),
    onSuccess: async () => {
      // Lista da loja, uso do plano e o mapa de "Na loja" do catálogo mudaram.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.storePlan() }),
      ]);
      router.push('/produtos');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // "Este produto já está na sua loja." não é falha: vira o estado "já adicionado".
        setAlreadyAdded(true);
        return;
      }
      setFormError(getErrorMessage(error));
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    let valid = true;
    const priceValue = parsePriceInput(price);
    if (!price.trim()) {
      setPriceError('Informe o seu preço de venda.');
      valid = false;
    } else if (priceValue === null) {
      setPriceError(PRICE_ERROR_MESSAGE);
      valid = false;
    } else setPriceError(null);

    const costValue = cost.trim() ? parsePriceInput(cost) : null;
    if (cost.trim() && costValue === null) {
      setCostError('Informe um custo válido (ex.: 39,90) ou deixe em branco.');
      valid = false;
    } else setCostError(null);

    // Ao adicionar, o estoque é opcional: vazio conta como 0 (esgotado, e já entra nos alertas de estoque baixo).
    const stockValue = stock.trim() ? parseStockInput(stock) : 0;
    if (stockValue === null) {
      setStockError(STOCK_ERROR_MESSAGE);
      valid = false;
    } else setStockError(null);

    if (!valid || priceValue === null || stockValue === null) return;

    mutation.mutate({
      price: priceValue,
      stock: stockValue,
      // Custo vazio não é enviado ("não informado"); 0 é enviado como custo válido.
      costPrice: costValue ?? undefined,
    });
  }

  const locked = mutation.isPending || alreadyAdded;
  const image = product.productImage ?? product.productImageSm;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3" noValidate>
      <div className="lg:col-span-2">
        {alreadyAdded && <Banner type="info" message="Este produto já está na sua loja." />}
        {formError && <Banner type="error" message={formError} />}

        <section className="rounded-2xl border border-ink-100 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">Preço e estoque</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              label="Preço de venda"
              value={price}
              onChange={(value) => {
                setPrice(value);
                setPriceError(null);
              }}
              error={priceError}
              disabled={locked}
              hint={
                suggested
                  ? `Preço sugerido pelo catálogo: ${formatCurrency(product.basePrice)}. Você pode alterar.`
                  : 'Este produto não tem preço sugerido. Defina o seu.'
              }
            />
            <MoneyField
              label="Preço de custo (opcional)"
              value={cost}
              onChange={(value) => {
                setCost(value);
                setCostError(null);
              }}
              error={costError}
              disabled={locked}
              hint="Quanto você paga por unidade. Usado para calcular o lucro; pode deixar em branco."
            />
          </div>
          <div className="mt-4 sm:max-w-xs">
            <StockField
              label="Quantidade em estoque (opcional)"
              value={stock}
              onChange={(value) => {
                setStock(value);
                setStockError(null);
              }}
              error={stockError}
              disabled={locked}
              hint="Em branco conta como 0 (esgotado) e o produto entra nos avisos de estoque baixo."
            />
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl border border-ink-100 bg-white p-4">
          <div className="flex h-44 items-center justify-center overflow-hidden rounded-xl bg-ink-50">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-contain" />
            ) : (
              <Icon name="box" size={40} className="text-primary-500" />
            )}
          </div>
          <p className="mt-3 text-[10px] font-bold uppercase text-primary-600">{product.brand.name}</p>
          <p className="text-sm font-bold text-ink-900">{product.name}</p>
          {product.description && <p className="mt-1 line-clamp-3 text-xs text-ink-400">{product.description}</p>}
          {product.barCode && <p className="mt-2 text-[11px] text-ink-400">Código de barras: {product.barCode}</p>}
        </section>

        {alreadyAdded ? (
          <Link
            href="/produtos/novo"
            className="flex h-12 items-center justify-center rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600"
          >
            Voltar ao catálogo
          </Link>
        ) : (
          <SubmitButton loading={mutation.isPending}>Adicionar à minha loja</SubmitButton>
        )}
      </aside>
    </form>
  );
}
