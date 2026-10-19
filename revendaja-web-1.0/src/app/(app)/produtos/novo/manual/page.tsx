'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addManualStoreProduct, uploadProductImage } from '@/lib/api/storeProducts';
import { getStorePlan } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { StoreProduct } from '@/lib/api/types';
import { PRICE_ERROR_MESSAGE, STOCK_ERROR_MESSAGE, parsePriceInput, parseStockInput } from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';
import { ComponentPicker } from '@/components/products/ComponentPicker';
import {
  Banner,
  Field,
  MoneyField,
  PageHeader,
  StockField,
  SubmitButton,
  TextInput,
} from '@/components/products/FormParts';

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const NAME_ERROR = `Informe o nome do produto (entre ${NAME_MIN} e ${NAME_MAX} caracteres).`;
const ACCEPTED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ComponentDraft = { storeProductId: string; name: string; image: string | null; quantity: number };

export default function ManualProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  const plan = planQuery.data;
  const blocked = plan ? !plan.limits.manualProductsEnabled : false;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // A pré-visualização é uma URL temporária do arquivo escolhido: libera quando troca ou sai da tela.
  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_IMAGES.includes(file.type)) {
      setImageError('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Imagem muito grande (máx. 5 MB).');
      return;
    }
    setImageError(null);
    setImageFile(file);
  }

  const mutation = useMutation({
    mutationFn: async (input: {
      name: string;
      description: string | null;
      price: number;
      costPrice: number | null;
      stock: number;
    }) => {
      // Sobe a foto primeiro (se houver) e manda a URL junto na criação.
      const image = imageFile ? (await uploadProductImage(imageFile)).url : null;
      return addManualStoreProduct({
        ...input,
        image,
        components:
          components.length > 0
            ? components.map((component) => ({
                storeProductId: component.storeProductId,
                quantity: component.quantity,
              }))
            : undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.storePlan() }),
      ]);
      router.push('/produtos');
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    let valid = true;

    const trimmedName = name.trim();
    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
      setNameError(NAME_ERROR);
      valid = false;
    } else setNameError(null);

    const priceValue = parsePriceInput(price);
    if (!price.trim()) {
      setPriceError('Informe o preço de venda.');
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

    // Ao cadastrar, o estoque é opcional: vazio conta como 0.
    const stockValue = stock.trim() ? parseStockInput(stock) : 0;
    if (stockValue === null) {
      setStockError(STOCK_ERROR_MESSAGE);
      valid = false;
    } else setStockError(null);

    if (!valid || priceValue === null || stockValue === null) return;

    mutation.mutate({
      name: trimmedName,
      description: description.trim() || null,
      price: priceValue,
      costPrice: costValue,
      stock: stockValue,
    });
  }

  function addComponent(item: StoreProduct) {
    setComponents((previous) =>
      previous.some((component) => component.storeProductId === item.id)
        ? previous
        : [
            ...previous,
            { storeProductId: item.id, name: item.product.name, image: item.product.productImageSm, quantity: 1 },
          ],
    );
    setPickerOpen(false);
  }

  function stepComponent(storeProductId: string, delta: number) {
    setComponents((previous) =>
      previous.map((component) =>
        component.storeProductId === storeProductId
          ? { ...component, quantity: Math.min(9999, Math.max(1, component.quantity + delta)) }
          : component,
      ),
    );
  }

  const locked = mutation.isPending;

  return (
    <div className="w-full">
      <PageHeader title="Cadastro manual" subtitle="Crie um produto próprio" backHref="/produtos/novo" />

      {blocked && plan && (
        <div className="animate-fade-up flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-500">
            <Icon name="lock" size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold text-ink-900">
            O plano {plan.plan.name} não inclui o cadastro manual
          </p>
          <p className="mt-1 max-w-sm text-xs text-ink-400">
            Faça upgrade para criar produtos próprios, como cestas de presente e kits. Enquanto isso, você pode
            adicionar produtos do catálogo.
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/planos"
              className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
            >
              Ver planos
            </Link>
            <Link
              href="/produtos/novo"
              className="rounded-lg border border-ink-200 px-4 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              Voltar ao catálogo
            </Link>
          </div>
        </div>
      )}

      {!blocked && (
        <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3" noValidate>
          <div className="lg:col-span-2">
            {formError && <Banner type="error" message={formError} />}

            <section className="rounded-2xl border border-ink-100 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-ink-900">Informações do produto</h2>

              <div className="mb-5 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={locked}
                  aria-label="Escolher foto do produto"
                  className="group relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-ink-300 bg-ink-50 text-ink-400 transition hover:border-primary-500 hover:text-primary-500"
                >
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="download" size={28} className="rotate-180" />
                  )}
                  <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-white shadow">
                    <Icon name="edit" size={13} />
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGES.join(',')}
                  className="hidden"
                  onChange={(event) => {
                    chooseImage(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <div className="text-xs">
                  <p className="font-semibold text-ink-700">Foto do produto (opcional)</p>
                  <p className="mt-0.5 text-ink-400">JPG, PNG ou WebP, até 5 MB.</p>
                  {imageFile && (
                    <button
                      type="button"
                      onClick={() => setImageFile(null)}
                      disabled={locked}
                      className="mt-2 font-semibold text-danger hover:underline"
                    >
                      Remover foto
                    </button>
                  )}
                  {imageError && <p className="mt-1 text-danger">{imageError}</p>}
                </div>
              </div>

              <div className="grid gap-4">
                <Field label="Nome do produto" error={nameError}>
                  <TextInput
                    value={name}
                    onChange={(value) => {
                      setName(value);
                      setNameError(null);
                    }}
                    error={nameError}
                    placeholder="Ex: Ursinho de pelúcia"
                    maxLength={NAME_MAX}
                    disabled={locked}
                    aria-label="Nome do produto"
                  />
                </Field>

                <Field label="Descrição (opcional)">
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Uma frase curta sobre o produto..."
                    maxLength={DESCRIPTION_MAX}
                    rows={3}
                    disabled={locked}
                    aria-label="Descrição do produto"
                    className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-500 disabled:opacity-60"
                  />
                </Field>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-ink-100 bg-white p-5">
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
                  hint="Quanto você paga por unidade. Usado para calcular o lucro."
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
                />
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="rounded-2xl border border-ink-100 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">O que vem junto (opcional)</h2>
                  <p className="mt-1 text-xs text-ink-400">
                    Se o produto é montado com outros itens do seu estoque (ex.: uma cesta), adicione-os. Ao vender,
                    o estoque de cada um é debitado junto.
                  </p>
                </div>
              </div>

              {components.length === 0 ? (
                <p className="mt-3 rounded-xl bg-ink-50 py-4 text-center text-xs text-ink-400">
                  Nenhum produto adicionado.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100">
                  {components.map((component) => (
                    <li key={component.storeProductId} className="animate-fade-up flex items-center gap-3 p-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                        {component.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={component.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon name="box" size={16} className="text-primary-500" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">
                        {component.name}
                      </span>
                      <span className="flex items-center rounded-full bg-ink-50">
                        <button
                          type="button"
                          onClick={() => stepComponent(component.storeProductId, -1)}
                          disabled={locked || component.quantity <= 1}
                          aria-label="Diminuir quantidade"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100 disabled:opacity-40"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                            <path d="M5 12h14" />
                          </svg>
                        </button>
                        <span className="min-w-6 text-center text-xs font-bold text-ink-900">{component.quantity}</span>
                        <button
                          type="button"
                          onClick={() => stepComponent(component.storeProductId, 1)}
                          disabled={locked || component.quantity >= 9999}
                          aria-label="Aumentar quantidade"
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setComponents((previous) =>
                            previous.filter((entry) => entry.storeProductId !== component.storeProductId),
                          )
                        }
                        disabled={locked}
                        aria-label={`Remover ${component.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-300 transition hover:bg-danger-soft hover:text-danger"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={locked}
                className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 text-xs font-semibold text-primary-600 transition hover:bg-primary-50"
              >
                <Icon name="plus" size={14} />
                Adicionar produto
              </button>
            </section>

            <SubmitButton loading={mutation.isPending}>Adicionar à minha loja</SubmitButton>
          </aside>
        </form>
      )}

      {pickerOpen && (
        <ComponentPicker
          excludeIds={new Set(components.map((component) => component.storeProductId))}
          onSelect={addComponent}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
