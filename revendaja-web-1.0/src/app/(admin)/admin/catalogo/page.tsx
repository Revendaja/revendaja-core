'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createCatalogProduct, uploadCatalogImage } from '@/lib/api/admin';
import { listBrands } from '@/lib/api/catalog';
import { getErrorMessage } from '@/lib/api/errors';
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

    setSaving(true);
    try {
      // A foto sobe primeiro (S3). Se o cadastro falhar depois, só sobra uma imagem solta no bucket.
      const productImage = image ? (await uploadCatalogImage(image)).url : undefined;
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
        subtitle="Cadastre produtos no catálogo global. Eles aparecem para todas as lojas."
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
              Foto do produto (opcional)
              <div className="flex items-center gap-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Prévia da foto" className="h-20 w-20 rounded-lg border border-ink-200 object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-ink-200 text-[11px] text-ink-400">
                    sem foto
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => pickImage(e.target.files?.[0])}
                    className="text-[12px] text-ink-600"
                  />
                  {image && (
                    <button type="button" className="self-start text-[12px] text-danger" onClick={clearImage}>
                      Remover foto
                    </button>
                  )}
                  <span className="text-[11px] font-normal text-ink-400">JPEG, PNG ou WEBP, até 5 MB.</span>
                </div>
              </div>
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
