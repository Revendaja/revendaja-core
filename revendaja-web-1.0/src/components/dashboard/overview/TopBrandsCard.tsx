'use client';

import { useQuery } from '@tanstack/react-query';
import { getTopBrands } from '@/lib/api/sales';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import { formatCurrency } from '@/lib/utils/format';
import { Icon } from '../icons';
import { Card, CardHeader } from './ui';

export function TopBrandsCard() {
  const brandsQuery = useQuery({ queryKey: queryKeys.topBrands(), queryFn: () => getTopBrands(3) });
  const brands = brandsQuery.data?.items;

  return (
    <Card className="h-full">
      <CardHeader title="Marcas mais vendidas" right={<Icon name="star" size={15} className="text-ink-400" />} />
      <p className="mt-0.5 text-[11px] text-ink-400">Últimos 30 dias</p>

      <div className="mt-3 flex flex-col gap-3">
        {brandsQuery.isPending &&
          [0, 1, 2].map((key) => <div key={key} className="h-[58px] animate-pulse rounded-xl bg-ink-50" />)}

        {brandsQuery.isError && (
          <div className="py-4 text-center">
            <p className="mb-3 text-xs font-medium text-danger">{getErrorMessage(brandsQuery.error)}</p>
            <button
              type="button"
              onClick={() => void brandsQuery.refetch()}
              className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {brands?.length === 0 && (
          <p className="py-6 text-center text-xs text-ink-400">Nenhuma venda de marca neste período.</p>
        )}

        {brands?.map((brand, index) => (
          <div key={brand.brandId} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500 text-sm font-semibold text-white">
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logo} alt="" className="h-full w-full bg-white object-contain" />
              ) : (
                brand.name.charAt(0).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-ink-900">{brand.name}</p>
              <p className="truncate text-[10px] text-ink-400">
                {brand.quantitySold} un. · {formatCurrency(brand.revenue)}
              </p>
            </div>
            <span className="text-[11px] font-semibold text-ink-300">#{index + 1}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
