import Link from 'next/link';
import type { HomeSummary } from '@/lib/api/types';

export function AlertsList({ alerts }: { alerts: HomeSummary['alerts'] }) {
  const { lowStock, pendingSales } = alerts;
  const total = (lowStock.count > 0 ? 1 : 0) + (pendingSales.count > 0 ? 1 : 0);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-ink-900">Atenção necessária</h2>
        {total > 0 && (
          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-600">
            {total} {total === 1 ? 'aviso' : 'avisos'}
          </span>
        )}
      </div>

      {total === 0 ? (
        <div className="rounded-3xl bg-white p-6 text-center text-sm text-ink-400 shadow-sm ring-1 ring-ink-100">
          Tudo certo por aqui — nenhum aviso no momento.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lowStock.count > 0 && (
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-ink-100">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
                  <BoxIcon />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-bold text-ink-900">
                    {lowStock.count} {lowStock.count === 1 ? 'produto em baixa' : 'produtos em baixa'}
                  </p>
                  <p className="text-xs text-ink-400">Estoque até {lowStock.threshold} un.</p>
                </div>
              </div>
              <ul className="divide-y divide-ink-100">
                {lowStock.products.slice(0, 5).map((product) => (
                  <li key={product.storeProductId} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate text-sm text-ink-700">{product.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                        product.stock === 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
                      }`}
                    >
                      {product.stock === 0 ? 'Zerado' : `${product.stock} un.`}
                    </span>
                  </li>
                ))}
              </ul>
              {lowStock.count > 5 && (
                <Link href="/produtos" className="mt-3 inline-block text-xs font-bold text-primary-600 hover:underline">
                  Ver todos ({lowStock.count})
                </Link>
              )}
            </div>
          )}

          {pendingSales.count > 0 && (
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-ink-100">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
                  <ClockIcon />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-bold text-ink-900">
                    {pendingSales.count} {pendingSales.count === 1 ? 'venda pendente' : 'vendas pendentes'}
                  </p>
                  <p className="text-xs text-ink-400">Aguardando confirmação de pagamento</p>
                </div>
              </div>
              <Link href="/vendas" className="mt-4 inline-block text-xs font-bold text-primary-600 hover:underline">
                Ver vendas
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BoxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
