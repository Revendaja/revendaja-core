'use client';

import { useEffect } from 'react';

// Janela de confirmação (no lugar do window.confirm): título, conteúdo livre e dois botões. Fecha com
// Esc ou clicando fora, exceto enquanto `busy` (a ação já está em andamento).
export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel = 'Voltar',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-up w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-ink-600">{children}</div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-11 rounded-xl border border-ink-200 px-5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={`h-11 rounded-xl px-5 text-sm font-semibold text-white transition disabled:opacity-60 ${
              tone === 'danger' ? 'bg-danger hover:opacity-90' : 'bg-primary-500 hover:bg-primary-600'
            }`}
          >
            {busy ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Aviso de produtos congelados, reaproveitado pelas confirmações de downgrade/cancelamento.
export function FrozenWarning({ count, planName, limit }: { count: number; planName: string; limit: number }) {
  return (
    <p className="rounded-xl bg-warning-soft px-3 py-2.5 text-xs font-medium leading-relaxed text-warning">
      O plano {planName} permite {limit} produtos e você tem {limit + count}. Os {count} mais recentes ficam
      congelados: somem da vitrine e você não poderá cadastrar novos, mas pode apagá-los. Eles voltam sozinhos se
      você apagar outros produtos ou fizer upgrade.
    </p>
  );
}
