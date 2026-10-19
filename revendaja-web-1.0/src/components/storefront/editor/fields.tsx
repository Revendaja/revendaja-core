'use client';

import { useRef, useState } from 'react';
import { uploadBannerImage } from '@/lib/api/storefrontConfig';
import { getErrorMessage } from '@/lib/api/errors';
import { Icon } from '@/components/dashboard/icons';
import { SafeImage } from '@/components/storefront/SafeImage';

export const MAX_IMAGE_MB = 5;
const ACCEPT = 'image/jpeg,image/png,image/webp';

// <select> no mesmo estilo dos campos de texto do painel.
export function SelectInput({
  value,
  onChange,
  options,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={label}
      className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-primary-500 disabled:opacity-60"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// Escolher/trocar/remover a imagem de um banner. Sobe para o servidor ao escolher o arquivo e guarda
// só a URL no rascunho (o que vale é gravado quando a loja clica em Salvar).
export function ImageField({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois.
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Imagem muito grande (máx. ${MAX_IMAGE_MB} MB).`);
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadBannerImage(file);
      onChange(url);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-ink-600">{label}</p>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-200 bg-ink-50 text-ink-300">
          {value ? (
            <SafeImage src={value} alt="Imagem atual" className="h-full w-full object-cover" fallback={<Icon name="box" size={22} />} />
          ) : (
            <span className="px-2 text-center text-[11px] leading-tight text-ink-400">Arte padrão</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={handleFile} disabled={disabled || uploading} className="sr-only" aria-label={label} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="h-9 rounded-lg border border-ink-200 px-3 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
          >
            {uploading ? 'Enviando...' : value ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              className="text-xs font-medium text-ink-500 transition hover:text-danger disabled:opacity-60"
            >
              Usar a arte padrão
            </button>
          )}
        </div>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      )}
    </div>
  );
}

// Selo "Padrão" / "Personalizado" no título de cada seção.
export function CustomizedBadge({ customized }: { customized: boolean }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        customized ? 'bg-primary-50 text-primary-600' : 'bg-ink-100 text-ink-500'
      }`}
    >
      {customized ? 'Personalizado' : 'Padrão'}
    </span>
  );
}
