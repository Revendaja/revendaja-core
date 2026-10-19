'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getHome } from '@/lib/api/home';
import { setMonthlyGoal } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils/format';
import { Card, CardHeader, Money } from './ui';

// Mesmo medidor semicircular do layout de referência: 4 trechos, cada um preenchido conforme a meta.
const SEGMENT_COLORS = ['#ffb892', '#ff9d6b', '#ff7f33', '#f2630f'];
const TRACK_COLOR = '#ffe9dd';
const CX = 120;
const CY = 120;
const R = 94;
const GAP = 3;
const STEP = 180 / SEGMENT_COLORS.length;

// Ponto no semicírculo: 180° = esquerda, 90° = topo, 0° = direita.
function point(angle: number) {
  const rad = (angle * Math.PI) / 180;
  return `${CX + R * Math.cos(rad)} ${CY - R * Math.sin(rad)}`;
}

function arc(index: number) {
  const from = 180 - index * STEP - GAP / 2;
  const to = 180 - (index + 1) * STEP + GAP / 2;
  return `M ${point(from)} A ${R} ${R} 0 0 1 ${point(to)}`;
}

export function GoalCard() {
  const homeQuery = useQuery({ queryKey: queryKeys.home(), queryFn: () => getHome(new Date()) });
  const queryClient = useQueryClient();
  const goal = homeQuery.data?.goal ?? null;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (target: number) => setMonthlyGoal(target),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
      setEditing(false);
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  function startEditing() {
    setValue(goal ? String(goal.target) : '');
    setError(null);
    setEditing(true);
  }

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

  const showForm = editing || (homeQuery.data !== undefined && goal === null);

  return (
    <Card>
      <CardHeader
        title="Meta de vendas"
        right={
          goal && !editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-900"
            >
              Editar
            </button>
          ) : undefined
        }
      />

      {homeQuery.isPending && (
        <div className="mt-4 animate-pulse">
          <div className="h-7 w-36 rounded-lg bg-ink-100" />
          <div className="mx-auto mt-4 aspect-[240/128] w-full max-w-[260px] rounded-t-full bg-ink-50" />
        </div>
      )}

      {homeQuery.isError && (
        <div className="mt-4 text-center">
          <p className="mb-3 text-xs font-medium text-danger">{getErrorMessage(homeQuery.error)}</p>
          <button
            type="button"
            onClick={() => void homeQuery.refetch()}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {homeQuery.data && showForm && (
        <form onSubmit={handleSubmit} className="mt-4">
          <p className="mb-3 text-xs text-ink-400">Defina quanto quer faturar neste mês.</p>
          <div className="flex h-10 items-center rounded-lg bg-ink-50 px-3 ring-1 ring-ink-100 focus-within:ring-primary-500">
            <span className="mr-1 text-sm font-semibold text-ink-400">R$</span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="5.000"
              inputMode="decimal"
              className="h-full w-full bg-transparent text-sm font-semibold text-ink-900 placeholder:text-ink-400 focus:outline-none"
              autoFocus
            />
          </div>
          {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="h-9 flex-1 rounded-lg bg-primary-500 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:opacity-60"
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar meta'}
            </button>
            {goal && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 rounded-lg px-3 text-xs font-medium text-ink-500 hover:bg-ink-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {homeQuery.data && goal && !showForm && (
        <>
          <Money
            value={homeQuery.data.revenue.total}
            className="mt-3 block text-[28px] font-semibold leading-none tracking-tight text-ink-900"
          />
          <p className="mt-1 text-[11px] text-ink-400">faturado de {formatCurrencyWhole(goal.target)}</p>

          <div className="relative mx-auto mt-4 aspect-[240/128] w-full max-w-[260px]">
            <svg viewBox="0 0 240 128" className="h-full w-full" aria-hidden>
              {SEGMENT_COLORS.map((color, index) => {
                const filled = Math.min(Math.max((goal.percent - index * 25) / 25, 0), 1);
                return (
                  <g key={color}>
                    <path d={arc(index)} fill="none" stroke={TRACK_COLOR} strokeWidth="26" />
                    {filled > 0 && (
                      <path
                        d={arc(index)}
                        fill="none"
                        stroke={color}
                        strokeWidth="26"
                        pathLength={1}
                        strokeDasharray={`${filled} 1`}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center leading-tight">
              <p className="text-[26px] font-semibold text-ink-900">{Math.floor(goal.percent)}%</p>
              <p className="text-[10px] text-ink-400">da meta do mês</p>
            </div>
          </div>

          <p
            className={`mt-3 text-center text-[11px] ${
              goal.remaining > 0 ? 'text-ink-500' : 'font-medium text-success'
            }`}
          >
            {goal.remaining > 0 ? `Faltam ${formatCurrency(goal.remaining)}` : 'Meta batida! Parabéns.'}
          </p>
        </>
      )}
    </Card>
  );
}
