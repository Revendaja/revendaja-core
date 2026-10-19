'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getStorePlan } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';

// Faixa que explica por que o cadastro está bloqueado quando a loja tem mais produtos do que o plano
// atual permite (ex.: depois de um downgrade). Os que passam do limite ficam congelados. Não aparece
// quando está tudo dentro do limite.
export function OverLimitBanner({ showAction = true }: { showAction?: boolean }) {
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  const data = planQuery.data;
  const max = data?.limits.maxProducts ?? null;
  if (!data || max === null || data.usage.products <= max) return null;

  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning-soft px-4 py-3">
      <div className="min-w-0 text-xs leading-relaxed text-warning">
        <p className="font-semibold">
          Sua loja está acima do limite do plano {data.plan.name}: {data.usage.products} de {max} produtos.
        </p>
        <p className="font-medium">
          {data.usage.frozen > 0
            ? `${data.usage.frozen} ${data.usage.frozen === 1 ? 'produto está congelado' : 'produtos estão congelados'} (fora da vitrine). `
            : ''}
          Apague produtos ou faça upgrade para voltar a cadastrar.
        </p>
      </div>
      {showAction && (
        <Link
          href="/planos"
          className="flex h-9 shrink-0 items-center rounded-lg bg-warning px-3 text-xs font-semibold text-white transition hover:opacity-90"
        >
          Ver planos
        </Link>
      )}
    </div>
  );
}
