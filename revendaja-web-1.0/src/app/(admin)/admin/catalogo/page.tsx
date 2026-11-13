'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createCatalogProduct, deleteCatalogProduct, updateCatalogProduct, uploadCatalogImage } from '@/lib/api/admin';
import { listBrands, listCatalogProducts } from '@/lib/api/catalog';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queryKeys';
import type { CatalogProduct } from '@/lib/api/types';
import { Card } from '@/components/dashboard/overview/ui';
import { PageHeader, QueryState, formatBrl } from '@/components/admin/ui';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const inputClass =
  'h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-[13px] text-ink-800 outline-none focus:border-primary-500';
const labelClass = 'flex flex-col gap-1 text-[12px] font-medium text-ink-600';

// "12,90" ou "1.012,90" -> número (NaN se não for número).
function parsePrice(text: string): number {
  return Number(text.trim().replace(/\./g, '').replace(',', '.'));
}

function ManageProducts({ brands }: { brands: { id: number | null; name: string }[] }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [form, setForm] = useState({ name: '', brandId: '', price: '', barCode: '', brandSku: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);
  const editFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!newImage) {
      setNewPreview(null);
      return;
    }
    const url = URL.createObjectURL(newImage);
    setNewPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newImage]);

  function pickNewImage(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return setError('Formato de imagem não suportado. Use JPEG, PNG ou WEBP.');
    if (file.size > MAX_IMAGE_BYTES) return setError('Imagem muito grande (máx. 5 MB).');
    setError(null);
    setNewImage(file);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ['admin-catalog-manage', term, page],
    queryFn: () => listCatalogProducts(page, { search: term }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-catalog-manage'] });
  }

  function startEdit(product: CatalogProduct) {
    setError(null);
    setNewImage(null);
    setEditing(product);
    setForm({
      name: product.name,
      brandId: String(product.brand.id ?? ''),
      price: String(product.basePrice).replace('.', ','),
      barCode: product.barCode ?? '',
      brandSku: product.brandSku ?? '',
      description: product.description ?? '',
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    const basePrice = parsePrice(form.price);
    const code = form.barCode.trim();
    if (form.name.trim().length < 2) return setError('Informe o nome do produto.');
    if (!form.brandId) return setError('Escolha a marca.');
    if (!Number.isFinite(basePrice) || basePrice <= 0) return setError('Informe um preço válido.');
    if (code && !/^\d{8,14}$/.test(code)) return setError('O código de barras deve ter de 8 a 14 dígitos.');
    setBusy(true);
    try {
      // A foto nova sobe primeiro (S3); sem foto nova, a atual é mantida.
      const productImage = newImage ? (await uploadCatalogImage(newImage)).url : undefined;
      await updateCatalogProduct(editing.id, {
        ...(productImage ? { productImage } : {}),
        name: form.name.trim(),
        brandId: Number(form.brandId),
        basePrice,
        barCode: code || null,
        brandSku: form.brandSku.trim() || null,
        description: form.description.trim() || null,
      });
      setEditing(null);
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(product: CatalogProduct) {
    if (!window.confirm(`Excluir "${product.name}" do catálogo?`)) return;
    try {
      await deleteCatalogProduct(product.id);
    } catch (err) {
      // 409: alguma loja usa o produto. Só remove se a administradora confirmar.
      if (isApiError(err) && err.status === 409) {
        if (!window.confirm(`${err.message}\n\nRemover mesmo assim?`)) return;
        try {
          await deleteCatalogProduct(product.id, true);
        } catch (second) {
          window.alert(getErrorMessage(second));
          return;
        }
      } else {
        window.alert(getErrorMessage(err));
        return;
      }
    }
    if (editing?.id === product.id) setEditing(null);
    refresh();
  }

  const products = query.data?.items ?? [];
  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  return (
    <Card className="max-w-2xl">
      <p className="mb-2 px-1 text-[13px] font-semibold text-ink-900">Gerenciar produtos</p>
      <input
        className={inputClass}
        placeholder="Buscar por nome ou código de barras…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {editing && (
        <form onSubmit={save} className="mt-3 flex flex-col gap-3 rounded-lg border border-ink-200 p-3">
          <p className="text-[12px] font-semibold text-ink-700">Editando #{editing.id}</p>
          <label className={labelClass}>
            Nome
            <input className={inputClass} value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Marca
              <select className={inputClass} value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id ?? ''}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Preço sugerido (R$)
              <input className={inputClass} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </label>
            <label className={labelClass}>
              Código de barras
              <input
                className={inputClass}
                inputMode="numeric"
                maxLength={14}
                value={form.barCode}
                onChange={(e) => setForm({ ...form, barCode: e.target.value.replace(/\D/g, '') })}
              />
            </label>
            <label className={labelClass}>
              SKU
              <input className={inputClass} maxLength={80} value={form.brandSku} onChange={(e) => setForm({ ...form, brandSku: e.target.value })} />
            </label>
          </div>
          <label className={labelClass}>
            Descrição
            <textarea
              className="min-h-20 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-800 outline-none focus:border-primary-500"
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className={labelClass}>
            Foto do produto
            <input
              ref={editFileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => pickNewImage(e.target.files?.[0])}
              className="sr-only"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => editFileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickNewImage(e.dataTransfer.files?.[0]);
              }}
              className="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-ink-300 bg-ink-50 text-ink-500 hover:border-primary-500"
            >
              {newPreview || editing.productImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={newPreview ?? editing.productImage ?? ''} alt="Foto do produto" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[13px] font-semibold">Clique para escolher a foto</span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-ink-900/60 py-1 text-center text-[12px] font-semibold text-white">
                {newImage ? 'Nova foto (salve para aplicar) · clique para trocar' : 'Clique ou arraste para trocar a foto'}
              </span>
            </button>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="h-9 rounded-lg bg-primary-500 px-4 text-[13px] font-semibold text-white disabled:opacity-60">
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="h-9 rounded-lg border border-ink-200 px-4 text-[13px] text-ink-700">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void remove(editing)}
              className="ml-auto h-9 rounded-lg border border-danger px-4 text-[13px] font-semibold text-danger"
            >
              Excluir produto
            </button>
          </div>
        </form>
      )}

      <div className="mt-3">
        {query.isLoading ? (
          <p className="px-1 text-[13px] text-ink-500">Carregando…</p>
        ) : query.error ? (
          <p className="px-1 text-[13px] text-danger">{getErrorMessage(query.error)}</p>
        ) : products.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-500">Nenhum produto encontrado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-100">
            {products.map((product) => (
              <li key={product.id} className="flex items-center gap-3 px-1 py-2 text-[13px]">
                {product.productImageSm ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.productImageSm} alt="" className="h-10 w-10 rounded-md object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-ink-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-900">{product.name}</p>
                  <p className="text-[12px] text-ink-500">
                    {product.brand.name} · {formatBrl(product.basePrice)}
                    {product.barCode ? ` · ${product.barCode}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => startEdit(product)} className="text-[12px] font-semibold text-primary-600">
                  Editar
                </button>
                <button type="button" onClick={() => void remove(product)} className="text-[12px] font-semibold text-danger">
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-ink-600">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">
            ← Anterior
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">
            Próxima →
          </button>
        </div>
      )}
    </Card>
  );
}

export default function AdminCatalogPage() {
  const brandsQuery = useQuery({
    queryKey: queryKeys.catalogBrands(),
    queryFn: listBrands,
    staleTime: Infinity,
  });

  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState('');
  const [barCode, setBarCode] = useState('');
  const [brandSku, setBrandSku] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CatalogProduct[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function clearImage() {
    setImage(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function pickImage(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Formato de imagem não suportado. Use JPEG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Imagem muito grande (máx. 5 MB).');
      return;
    }
    setError(null);
    setImage(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const basePrice = parsePrice(price);
    const code = barCode.trim();
    if (name.trim().length < 2) return setError('Informe o nome do produto.');
    if (!brandId) return setError('Escolha a marca.');
    if (!Number.isFinite(basePrice) || basePrice <= 0) return setError('Informe um preço válido.');
    if (code && !/^\d{8,14}$/.test(code)) return setError('O código de barras deve ter de 8 a 14 dígitos.');
    if (!image) return setError('Adicione a foto do produto.');

    setSaving(true);
    try {
      // A foto sobe primeiro (S3). Se o cadastro falhar depois, só sobra uma imagem solta no bucket.
      const productImage = (await uploadCatalogImage(image)).url;
      const product = await createCatalogProduct({
        name: name.trim(),
        brandId: Number(brandId),
        barCode: code || undefined,
        brandSku: brandSku.trim() || undefined,
        description: description.trim() || undefined,
        basePrice,
        productImage,
      });
      setCreated((current) => [product, ...current]);
      // Mantém a marca escolhida: normalmente se cadastra vários produtos da mesma marca em sequência.
      setName('');
      setBarCode('');
      setBrandSku('');
      setPrice('');
      setDescription('');
      clearImage();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const brands = brandsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Catálogo"
        subtitle="Cadastre, edite e remova produtos do catálogo global. As mudanças valem para todas as lojas."
      />

      {brandsQuery.isLoading || brandsQuery.error ? (
        <QueryState
          loading={brandsQuery.isLoading}
          error={brandsQuery.error ? getErrorMessage(brandsQuery.error) : null}
          onRetry={() => void brandsQuery.refetch()}
        />
      ) : (
        <Card className="max-w-2xl">
          <form onSubmit={submit} className="flex flex-col gap-4 p-1">
            <label className={labelClass}>
              Nome do produto
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Marca
                <select className={inputClass} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id ?? ''}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Preço sugerido (R$)
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Código de barras (opcional)
                <input
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="7891033870134"
                  value={barCode}
                  onChange={(e) => setBarCode(e.target.value.replace(/\D/g, ''))}
                  maxLength={14}
                />
              </label>
              <label className={labelClass}>
                Código da marca / SKU (opcional)
                <input className={inputClass} value={brandSku} onChange={(e) => setBrandSku(e.target.value)} maxLength={80} />
              </label>
            </div>

            <label className={labelClass}>
              Descrição (opcional)
              <textarea
                className="min-h-24 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-800 outline-none focus:border-primary-500"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </label>

            <div className={labelClass}>
              <span>
                Foto do produto <span className="text-danger">*</span>
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pickImage(e.target.files?.[0])}
                className="sr-only"
                tabIndex={-1}
              />
              {/* A área toda é clicável (e aceita arrastar a foto): não precisa mirar num texto pequeno. */}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickImage(e.dataTransfer.files?.[0]);
                }}
                className={`flex h-48 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
                  error === 'Adicione a foto do produto.'
                    ? 'border-danger bg-danger/5 text-danger'
                    : 'border-ink-300 bg-ink-50 text-ink-500 hover:border-primary-500 hover:bg-primary-50 hover:text-primary-600'
                }`}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Prévia da foto" className="h-full w-full object-contain" />
                ) : (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
                      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    <span className="text-[14px] font-semibold">Clique para escolher a foto</span>
                    <span className="text-[12px] font-normal">ou arraste a imagem até aqui</span>
                    <span className="text-[11px] font-normal opacity-80">Obrigatória · JPEG, PNG ou WEBP, até 5 MB</span>
                  </>
                )}
              </button>
              {image && (
                <div className="flex items-center gap-3 text-[12px]">
                  <button type="button" className="font-semibold text-primary-600" onClick={() => fileInput.current?.click()}>
                    Trocar foto
                  </button>
                  <button type="button" className="font-semibold text-danger" onClick={clearImage}>
                    Remover foto
                  </button>
                </div>
              )}
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="h-10 self-start rounded-lg bg-primary-500 px-5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Adicionar ao catálogo'}
            </button>
          </form>
        </Card>
      )}

      {!brandsQuery.isLoading && !brandsQuery.error && <ManageProducts brands={brands} />}

      {created.length > 0 && (
        <Card className="max-w-2xl">
          <p className="mb-2 px-1 text-[13px] font-semibold text-ink-900">Adicionados nesta sessão</p>
          <ul className="flex flex-col divide-y divide-ink-100">
            {created.map((product) => (
              <li key={product.id} className="flex items-center gap-3 px-1 py-2 text-[13px]">
                {product.productImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.productImage} alt="" className="h-10 w-10 rounded-md object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-ink-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-900">{product.name}</p>
                  <p className="text-[12px] text-ink-500">
                    {product.brand.name} · {formatBrl(product.basePrice)}
                    {product.barCode ? ` · ${product.barCode}` : ''}
                  </p>
                </div>
                <span className="text-[12px] text-ink-400">#{product.id}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
