'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setMonthlyGoal } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils/format';
import type { HomeSummary } from '@/lib/api/types';

const CARD = 'h-full rounded-3xl bg-white p-6 shadow-sm ring-1 ring-ink-100';

export function GoalCard({ goal }: { goal: HomeSummary['goal'] }) {
  const [editing, setEditing] = useState(goal === null);
  const [value, setValue] = useState(goal ? String(goal.target) : '');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (target: number) => setMonthlyGoal(target),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
      setEditing(false);
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const target = Number(value.replace(',', '.'));
    if (!Number.isFinite(target) || target <= 0) {
      setError('Informe um valor de meta válido, maior que zero.');
      return;
    }
    setError(null);
    mutation.mutate(target);
  }

  if (editing) {
    return (
      <div className={CARD}>
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <FlagIcon />
          </span>
          <span className="text-sm font-semibold text-ink-900">Meta de vendas do mês</span>
        </div>
        <p className="mb-4 text-xs text-ink-400">Defina quanto quer faturar neste mês.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex h-11 flex-1 items-center rounded-xl bg-ink-50 px-3 ring-1 ring-ink-100 focus-within:ring-primary-500">
            <span className="mr-1 text-sm font-semibold text-ink-400">R$</span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="5.000"
              inputMode="decimal"
              className="h-full w-full bg-transparent text-sm font-bold text-ink-900 placeholder:text-ink-400 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="h-11 flex-1 rounded-xl bg-primary-500 px-5 text-sm font-bold text-white transition hover:bg-primary-600 disabled:opacity-60"
            >
              {mutation.isPending ? '...' : 'Salvar'}
            </button>
            {goal !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="h-11 rounded-xl px-3 text-sm font-semibold text-ink-500 hover:bg-ink-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
        {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      </div>
    );
  }

  if (!goal) return null;

  const percent = Math.min(Math.max(goal.percent, 0), 100);
  const reached = goal.remaining <= 0;

  return (
    <div className={CARD}>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <FlagIcon />
          </span>
          <span className="text-sm font-semibold text-ink-900">Meta de vendas</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setValue(String(goal.target));
            setEditing(true);
          }}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-500 transition hover:bg-ink-50 hover:text-ink-900"
        >
          Editar
        </button>
      </div>

      <div className="flex items-center gap-5">
        <Ring percent={percent} />
        <div className="min-w-0">
          <p className="text-xs text-ink-400">Meta do mês</p>
          <p className="text-xl font-extrabold text-ink-900">{formatCurrencyWhole(goal.target)}</p>
          <p className={`mt-1 text-xs ${reached ? 'font-semibold text-success' : 'text-ink-500'}`}>
            {reached ? 'Meta batida! Parabéns.' : `Faltam ${formatCurrency(goal.remaining)}`}
          </p>
        </div>
      </div>
    </div>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-ink-100" />
        <circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          className="stroke-primary-500 transition-all duration-700"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-ink-900">
        {Math.floor(percent)}%
      </span>
    </div>
  );
}

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4M5 4h11l-2.5 4L16 12H5" />
    </svg>
  );
}
