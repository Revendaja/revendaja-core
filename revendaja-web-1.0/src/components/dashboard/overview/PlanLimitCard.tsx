'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getStorePlan } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { StorePlanUsage } from '@/lib/api/types';
import { Card, CardHeader } from './ui';

export function PlanLimitCard() {
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });

  return (
    <Card className="h-full">
      <CardHeader
        title="Limite do plano"
        right={
          planQuery.data && (
            <span className="rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-600">
              {planQuery.data.plan.name}
            </span>
          )
        }
      />

      {planQuery.isPending && (
        <div className="mt-4 animate-pulse">
          <div className="h-8 w-40 rounded-lg bg-ink-100" />
          <div className="mt-4 h-2 rounded-full bg-ink-100" />
          <div className="mt-5 h-24 rounded-xl bg-ink-50" />
        </div>
      )}

      {planQuery.isError && (
        <div className="py-8 text-center">
          <p className="mb-3 text-xs font-medium text-danger">{getErrorMessage(planQuery.error)}</p>
          <button
            type="button"
            onClick={() => void planQuery.refetch()}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {planQuery.data && <PlanLimitContent data={planQuery.data} />}
    </Card>
  );
}

function PlanLimitContent({ data }: { data: StorePlanUsage }) {
  const { limits, usage } = data;
  const max = limits.maxProducts;
  const percent = max === null ? 0 : Math.min((usage.products / max) * 100, 100);
  const full = max !== null && usage.products >= max;
  const nearLimit = max !== null && percent >= 80;
  const remaining = max === null ? null : Math.max(max - usage.products, 0);

  const features = [
    { label: 'Cadastro manual de produtos', enabled: limits.manualProductsEnabled },
    { label: 'Categorias', enabled: limits.categoriesEnabled },
    { label: 'Promoções', enabled: limits.promotionsEnabled },
  ];

  return (
    <>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="leading-none">
          <span className="text-[28px] font-semibold tracking-tight text-ink-900">{usage.products}</span>
          <span className="ml-1.5 text-sm text-ink-400">
            {max === null ? 'produtos cadastrados' : `de ${max} produtos`}
          </span>
        </div>
        {max !== null && (
          <span className={`text-xs font-semibold ${full ? 'text-danger' : nearLimit ? 'text-warning' : 'text-ink-500'}`}>
            {Math.floor(percent)}%
          </span>
        )}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            full ? 'bg-danger' : nearLimit ? 'bg-warning' : 'bg-primary-500'
          }`}
          style={{ width: max === null ? '100%' : `${percent}%`, opacity: max === null ? 0.25 : 1 }}
        />
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        {remaining === null
          ? 'Produtos ilimitados no seu plano.'
          : full
            ? 'Limite atingido: faça upgrade para cadastrar mais.'
            : `Você ainda pode cadastrar ${remaining} ${remaining === 1 ? 'produto' : 'produtos'}.`}
      </p>

      <ul className="mt-4 flex flex-col gap-2 rounded-xl border border-ink-100 p-3">
        {features.map((feature) => (
          <li key={feature.label} className="flex items-center justify-between text-xs">
            <span className={feature.enabled ? 'text-ink-700' : 'text-ink-400'}>{feature.label}</span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                feature.enabled ? 'bg-success-soft text-success' : 'bg-ink-50 text-ink-300'
              }`}
              title={feature.enabled ? 'Liberado' : 'Não incluso no plano'}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {feature.enabled ? <path d="m5 12 5 5 9-10" /> : <path d="M6 6l12 12M18 6 6 18" />}
              </svg>
            </span>
          </li>
        ))}
      </ul>

      {(full || nearLimit || !limits.manualProductsEnabled) && (
        <Link href="/planos" className="mt-3 inline-block text-xs font-semibold text-primary-600 hover:underline">
          Ver planos
        </Link>
      )}
    </>
  );
}
