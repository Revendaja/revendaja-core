'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getStoreProduct,
  removeStoreProduct,
  updateStoreProduct,
  uploadProductImage,
  type UpdateStoreProductInput,
} from '@/lib/api/storeProducts';
import { createStoreCategory, listStoreCategories } from '@/lib/api/storeCategories';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { StoreProduct } from '@/lib/api/types';
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
import { ComponentPicker } from '@/components/products/ComponentPicker';
import {
  Banner,
  Field,
  MoneyField,
  PageHeader,
  StockField,
  SubmitButton,
  TextInput,
  ToggleRow,
} from '@/components/products/FormParts';

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const NAME_ERROR = `Informe o nome do produto (entre ${NAME_MIN} e ${NAME_MAX} caracteres).`;
const ACCEPTED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PROMO_DURATION_OPTIONS = [
  { days: 1, label: 'Até amanhã' },
  { days: 3, label: '3 dias' },
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
];

function formatPromoEndDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

type ComponentDraft = { storeProductId: string; name: string; image: string | null; quantity: number };

function sameComponents(a: ComponentDraft[], b: ComponentDraft[]): boolean {
  if (a.length !== b.length) return false;
  const key = (c: ComponentDraft) => `${c.storeProductId}:${c.quantity}`;
  const setA = new Set(a.map(key));
  return b.every((c) => setA.has(key(c)));
}

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const productQuery = useQuery({
    queryKey: queryKeys.storeProduct(params.id),
    queryFn: () => getStoreProduct(params.id),
  });

  return (
    <div className="w-full">
      <PageHeader
        title="Editar produto"
        subtitle={productQuery.data?.product.name}
        backHref="/produtos"
      />

      {productQuery.isPending && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl border border-ink-100 bg-ink-50 lg:col-span-2" />
          <div className="h-56 animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />
        </div>
      )}

      {productQuery.isError && (
        <div className="rounded-2xl border border-ink-100 p-10 text-center">
          <p className="mb-3 text-sm font-medium text-danger">{getErrorMessage(productQuery.error)}</p>
          <button
            type="button"
            onClick={() => void productQuery.refetch()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {productQuery.data && <EditForm key={productQuery.data.id} product={productQuery.data} />}
    </div>
  );
}

function EditForm({ product }: { product: StoreProduct }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isManual = product.kind === 'manual';
  const suggested = hasSuggestedPrice(product.product.basePrice);

  const [name, setName] = useState(product.product.name);
  const [description, setDescription] = useState(product.product.description ?? '');
  const [remoteImage, setRemoteImage] = useState<string | null>(product.product.productImage);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageTouched, setImageTouched] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [price, setPrice] = useState(formatPriceInput(product.price));
  const [cost, setCost] = useState(product.costPrice != null ? formatPriceInput(product.costPrice) : '');
  const [stock, setStock] = useState(String(product.stock));
  const [isActive, setIsActive] = useState(product.isActive);
  const [components, setComponents] = useState<ComponentDraft[]>(
    product.components.map((c) => ({ storeProductId: c.storeProductId, name: c.name, image: c.image, quantity: c.quantity })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const [categoryId, setCategoryId] = useState<string | null>(product.category?.id ?? null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const categoriesQuery = useQuery({ queryKey: queryKeys.storeCategories(), queryFn: listStoreCategories });
  const categories = categoriesQuery.data?.items ?? [];

  const [promoEnabled, setPromoEnabled] = useState(product.isPromoActive);
  const [promoPrice, setPromoPrice] = useState(product.promoPrice != null ? formatPriceInput(product.promoPrice) : '');
  const [promoEndsAt, setPromoEndsAt] = useState<Date | null>(product.promoEndsAt ? new Date(product.promoEndsAt) : null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [promoPriceError, setPromoPriceError] = useState<string | null>(null);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

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
    setImageTouched(true);
  }

  function removeImage() {
    setImageFile(null);
    setRemoteImage(null);
    setImageTouched(true);
  }

  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setAddingCategory(true);
    setCategoryFormError(null);
    try {
      const created = await createStoreCategory(trimmed);
      queryClient.setQueryData(queryKeys.storeCategories(), (current: { items: typeof categories } | undefined) => ({
        items: [...(current?.items ?? []), created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      }));
      setCategoryId(created.id);
      setNewCategoryName('');
    } catch (error) {
      setCategoryFormError(getErrorMessage(error));
    } finally {
      setAddingCategory(false);
    }
  }

  function addComponent(item: StoreProduct) {
    setComponents((previous) =>
      previous.some((c) => c.storeProductId === item.id)
        ? previous
        : [...previous, { storeProductId: item.id, name: item.product.name, image: item.product.productImageSm, quantity: 1 }],
    );
    setPickerOpen(false);
  }

  function stepComponent(storeProductId: string, delta: number) {
    setComponents((previous) =>
      previous.map((c) =>
        c.storeProductId === storeProductId ? { ...c, quantity: Math.min(9999, Math.max(1, c.quantity + delta)) } : c,
      ),
    );
  }

  const updateMutation = useMutation({
    mutationFn: async (changes: UpdateStoreProductInput) => {
      let imageForPayload: string | null | undefined;
      if (isManual && imageTouched) {
        imageForPayload = imageFile ? (await uploadProductImage(imageFile)).url : null;
      }
      return updateStoreProduct(product.id, {
        ...changes,
        ...(imageForPayload !== undefined ? { image: imageForPayload } : {}),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.storeProduct(product.id) }),
      ]);
      router.push('/produtos');
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeStoreProduct(product.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() });
      router.push('/produtos');
    },
    onError: (error) => {
      setFormError(getErrorMessage(error));
      setDeleteConfirming(false);
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    let valid = true;

    const trimmedName = name.trim();
    if (isManual) {
      if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
        setNameError(NAME_ERROR);
        valid = false;
      } else setNameError(null);
    }

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

    const stockValue = parseStockInput(stock);
    if (stockValue === null) {
      setStockError(STOCK_ERROR_MESSAGE);
      valid = false;
    } else setStockError(null);

    // O preço promocional precisa ser menor que o preço de venda DESTA MESMA gravação, não o antigo.
    let promoPriceValue: number | null = null;
    if (promoEnabled) {
      const effectivePrice = priceValue ?? 0;
      promoPriceValue = parsePriceInput(promoPrice);
      if (promoPriceValue === null) {
        setPromoPriceError('Informe o preço promocional.');
        valid = false;
      } else if (promoPriceValue >= effectivePrice) {
        setPromoPriceError('O preço promocional precisa ser menor que o preço de venda.');
        valid = false;
      } else if (!promoEndsAt) {
        setPromoPriceError('Escolha por quanto tempo a promoção vale.');
        valid = false;
      } else setPromoPriceError(null);
    } else setPromoPriceError(null);

    if (!valid || priceValue === null || stockValue === null) return;

    const trimmedDescription = description.trim();
    const changes: UpdateStoreProductInput = {};

    if (isManual) {
      if (trimmedName !== product.product.name) changes.name = trimmedName;
      if (trimmedDescription !== (product.product.description ?? '')) changes.description = trimmedDescription || null;
      const componentsPayload = components.map((c) => ({ storeProductId: c.storeProductId, quantity: c.quantity }));
      if (!sameComponents(components, product.components.map((c) => ({ ...c })))) {
        changes.components = componentsPayload;
      }
    }
    if (priceValue !== product.price) changes.price = priceValue;
    if (costValue !== product.costPrice) changes.costPrice = costValue;
    if (stockValue !== product.stock) changes.stock = stockValue;
    if (isActive !== product.isActive) changes.isActive = isActive;
    if (categoryId !== (product.category?.id ?? null)) changes.categoryId = categoryId;

    if (promoEnabled) {
      const nextEndsAtIso = promoEndsAt!.toISOString();
      if (!product.isPromoActive || promoPriceValue !== product.promoPrice || nextEndsAtIso !== product.promoEndsAt) {
        changes.promoPrice = promoPriceValue;
        changes.promoEndsAt = nextEndsAtIso;
      }
    } else if (product.isPromoActive) {
      changes.promoPrice = null;
      changes.promoEndsAt = null;
    }

    if (Object.keys(changes).length === 0 && !(isManual && imageTouched)) {
      router.push('/produtos');
      return;
    }

    updateMutation.mutate(changes);
  }

  const locked = updateMutation.isPending || removeMutation.isPending;
  const imageUri = imagePreview ?? remoteImage;
  const brandName = product.product.brand.name;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3" noValidate>
      <div className="lg:col-span-2">
        {formError && <Banner type="error" message={formError} />}

        {isManual && (
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
                {imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUri} alt="" className="h-full w-full object-cover" />
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
                {imageUri && (
                  <button
                    type="button"
                    onClick={removeImage}
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
        )}

        <section className={`rounded-2xl border border-ink-100 bg-white p-5 ${isManual ? 'mt-4' : ''}`}>
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
                !isManual
                  ? suggested
                    ? `Preço sugerido pelo catálogo: ${formatCurrency(product.product.basePrice)}.`
                    : 'Este produto não tem preço sugerido no catálogo.'
                  : undefined
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
              hint="Quanto você paga por unidade. Usado para calcular o lucro."
            />
          </div>
          <div className="mt-4 sm:max-w-xs">
            <StockField
              label="Quantidade em estoque"
              value={stock}
              onChange={(value) => {
                setStock(value);
                setStockError(null);
              }}
              error={stockError}
              disabled={locked}
              hint="Quantas unidades você tem agora. Use 0 para esgotado."
            />
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-ink-100 bg-white p-5">
          <ToggleRow
            title="Colocar em promoção"
            description="Mostra um preço com desconto por tempo limitado na vitrine"
            checked={promoEnabled}
            onChange={(value) => {
              setPromoEnabled(value);
              setPromoPriceError(null);
            }}
            disabled={locked}
          />

          {promoEnabled && (
            <div className="mt-4 border-t border-ink-100 pt-4">
              <MoneyField
                label="Preço promocional"
                value={promoPrice}
                onChange={(value) => {
                  setPromoPrice(value);
                  setPromoPriceError(null);
                }}
                error={promoPriceError}
                disabled={locked}
              />

              <p className="mb-1.5 mt-4 text-xs font-semibold text-ink-600">Validade</p>
              <div className="flex flex-wrap gap-2">
                {PROMO_DURATION_OPTIONS.map((option) => {
                  const active =
                    promoEndsAt !== null &&
                    Math.round((promoEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) === option.days;
                  return (
                    <button
                      key={option.days}
                      type="button"
                      onClick={() => setPromoEndsAt(new Date(Date.now() + option.days * 24 * 60 * 60 * 1000))}
                      disabled={locked}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        active ? 'bg-primary-500 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {promoEndsAt && (
                <p className="mt-2.5 text-xs text-ink-400">Promoção válida até {formatPromoEndDate(promoEndsAt)}</p>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl border border-ink-100 bg-white p-4">
          <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl bg-ink-50">
            {!isManual && product.product.productImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.product.productImage} alt="" className="h-full w-full object-contain" />
            ) : !isManual ? (
              <Icon name="box" size={36} className="text-primary-500" />
            ) : imageUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUri} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="box" size={36} className="text-primary-500" />
            )}
          </div>
          {!isManual && (
            <>
              <p className="mt-3 text-[10px] font-bold uppercase text-primary-600">{brandName}</p>
              <p className="text-sm font-bold text-ink-900">{product.product.name}</p>
            </>
          )}
          {product.product.barCode && (
            <p className="mt-2 text-[11px] text-ink-400">Código de barras: {product.product.barCode}</p>
          )}
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5">
          <ToggleRow
            title="Visível na vitrine"
            description="Escondido, sai da vitrine mas mantém o preço"
            checked={isActive}
            onChange={setIsActive}
            disabled={locked}
          />
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Categoria</h2>
          <select
            value={categoryId ?? ''}
            onChange={(event) => setCategoryId(event.target.value || null)}
            disabled={locked}
            aria-label="Categoria"
            className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-primary-500 disabled:opacity-60"
          >
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Criar nova categoria"
              maxLength={40}
              disabled={addingCategory || locked}
              aria-label="Nome da nova categoria"
              className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void handleCreateCategory()}
              disabled={addingCategory || locked || !newCategoryName.trim()}
              aria-label="Criar categoria"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-600 disabled:opacity-50"
            >
              <Icon name="check" size={16} strokeWidth={3} />
            </button>
          </div>
          {categoryFormError && <p className="mt-1.5 text-xs text-danger">{categoryFormError}</p>}
        </section>

        {isManual && (
          <section className="rounded-2xl border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-900">O que vem junto (opcional)</h2>
            <p className="mt-1 text-xs text-ink-400">
              Se esse produto é montado com outros itens do seu estoque, adicione-os. Ao vender, o estoque de cada um
              é debitado junto.
            </p>

            {components.length === 0 ? (
              <p className="mt-3 rounded-xl bg-ink-50 py-4 text-center text-xs text-ink-400">Nenhum produto adicionado.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100">
                {components.map((component) => (
                  <li key={component.storeProductId} className="flex items-center gap-3 p-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                      {component.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={component.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon name="box" size={16} className="text-primary-500" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">{component.name}</span>
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
                      onClick={() => setComponents((previous) => previous.filter((c) => c.storeProductId !== component.storeProductId))}
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
        )}

        <SubmitButton loading={updateMutation.isPending}>Salvar alterações</SubmitButton>

        {deleteConfirming ? (
          <div className="animate-fade-up rounded-2xl border border-danger/30 bg-danger-soft p-4">
            <p className="text-xs font-semibold text-danger">Remover este produto da sua loja?</p>
            <p className="mt-1 text-xs text-danger/80">Não afeta o catálogo global nem outras lojas. Essa ação não pode ser desfeita.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirming(false)}
                disabled={removeMutation.isPending}
                className="h-9 flex-1 rounded-lg border border-ink-200 bg-white text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
                className="h-9 flex-1 rounded-lg bg-danger text-xs font-semibold text-white transition hover:bg-danger/90 disabled:opacity-60"
              >
                {removeMutation.isPending ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeleteConfirming(true)}
            disabled={locked}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60"
          >
            <Icon name="trash" size={14} />
            Remover produto da loja
          </button>
        )}
      </aside>

      {pickerOpen && (
        <ComponentPicker
          excludeIds={new Set([...components.map((c) => c.storeProductId), product.id])}
          onSelect={addComponent}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </form>
  );
}
