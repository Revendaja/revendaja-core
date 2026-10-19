'use client';

import { useState } from 'react';
import { Banner } from '@/components/products/FormParts';
import { Card } from '@/components/dashboard/overview/ui';
import { getErrorMessage } from '@/lib/api/errors';
import { CustomizedBadge } from './fields';

// Moldura comum a todas as seções do editor: título, selo, formulário e os botões Salvar / Restaurar.
// Cada seção guarda o próprio rascunho e é salva sozinha (`onSave`); `onReset` apaga a personalização
// e o padrão volta. `isValid` desabilita o Salvar enquanto algum campo obrigatório está vazio.
export function SectionEditor<T>({
  title,
  description,
  customized,
  draft,
  saved,
  isValid,
  onSave,
  onReset,
  children,
}: {
  title: string;
  description: string;
  customized: boolean;
  draft: T;
  // O que está valendo agora (para saber se há mudança a salvar).
  saved: T;
  isValid: boolean;
  onSave: (value: T) => Promise<void>;
  onReset: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function run(kind: 'save' | 'reset', action: () => Promise<void>, success: string) {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
      setMessage({ type: 'info', text: success });
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="leading-tight">
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          <p className="mt-1 text-xs text-ink-400">{description}</p>
        </div>
        <CustomizedBadge customized={customized} />
      </div>

      <div className="mt-4">{message && <Banner type={message.type} message={message.text} />}</div>

      <div className="flex flex-col gap-4">{children}</div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={() => void run('reset', onReset, 'Voltou ao padrão.')}
          disabled={!customized || busy !== null}
          className="text-xs font-semibold text-ink-500 transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'reset' ? 'Restaurando...' : 'Restaurar padrão'}
        </button>
        <button
          type="button"
          onClick={() => void run('save', () => onSave(draft), 'Alterações salvas.')}
          disabled={!dirty || !isValid || busy !== null}
          className="h-10 rounded-xl bg-primary-500 px-5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'save' ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </Card>
  );
}

// Texto obrigatório: depois de aparar os espaços precisa sobrar algo (o servidor também exige).
export const filled = (value: string) => value.trim().length > 0;
