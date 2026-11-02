'use client';

import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/lib/api/errors';
import {
  CepNotFoundError,
  cepPlace,
  isValidCep,
  lookupCep,
  maskCep,
  type VisitorCep,
} from '@/lib/storefront/visitor';
import { Icon } from '@/components/dashboard/icons';
import { PinIcon } from './icons';

// "Informar CEP" do cabeçalho: abre um painelzinho, consulta o endereço e guarda neste aparelho.
export function CepPicker({
  cep,
  onChange,
}: {
  cep: VisitorCep | null;
  onChange: (cep: VisitorCep | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fecha com clique fora ou Esc.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setValue(cep ? maskCep(cep.cep) : '');
      setError(null);
    }
    setOpen((current) => !current);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidCep(value)) return setError('Digite os 8 números do CEP.');
    setLoading(true);
    setError(null);
    try {
      onChange(await lookupCep(value));
      setOpen(false);
    } catch (err) {
      setError(err instanceof CepNotFoundError ? err.message : getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const place = cep ? cepPlace(cep) : '';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={cep ? `CEP ${maskCep(cep.cep)}, alterar` : 'Informar CEP'}
        className="flex h-10 items-center gap-2 rounded-full px-2 text-left text-ink-700 transition hover:bg-ink-50 hover:text-primary-600 md:px-3"
      >
        <PinIcon size={18} className="shrink-0" />
        <span className="hidden min-w-0 leading-tight lg:block">
          <span className="block text-[11px] text-ink-400">{cep ? 'Entregar em' : 'Receber em casa?'}</span>
          <span className="block max-w-36 truncate text-[13px] font-semibold">
            {cep ? `${maskCep(cep.cep)}${place ? ` · ${place}` : ''}` : 'Informar CEP'}
          </span>
        </span>
      </button>

      {open && (
        <form
          onSubmit={submit}
          className="absolute right-0 top-12 z-40 w-72 rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_12px_32px_rgba(16,24,40,0.14)]"
        >
          <p className="text-sm font-semibold text-ink-900">Informe seu CEP</p>
          <p className="mt-0.5 text-xs text-ink-500">Usamos para preencher o endereço da entrega.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={value}
              onChange={(event) => setValue(maskCep(event.target.value))}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              aria-label="CEP"
              autoFocus
              className="h-10 min-w-0 flex-1 rounded-xl border border-ink-200 px-3 text-sm text-ink-900 outline-none focus:border-primary-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-10 rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:opacity-60"
            >
              {loading ? '...' : 'Aplicar'}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {error}
            </p>
          )}
          {cep && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
            >
              <Icon name="close" size={12} /> Remover CEP
            </button>
          )}
        </form>
      )}
    </div>
  );
}
