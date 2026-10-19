'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelSale, getSale, markSalePaid } from '@/lib/api/sales';
import { queryKeys } from '@/lib/api/queryKeys';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import type { SaleDetail, SaleStatusValue } from '@/lib/api/types';
import { formatCurrency, formatWhatsapp, whatsappUrl } from '@/lib/utils/format';
import { formatDateFull, formatTime, PAYMENT_ICON, paymentLabel } from '@/lib/utils/sales';
import { Icon } from '@/components/dashboard/icons';
import { PageHeader } from '@/components/products/FormParts';

const STATUS_STYLE: Record<SaleStatusValue, { bg: string; text: string; label: string }> = {
  paid: { bg: 'bg-success-soft', text: 'text-success', label: 'Recebido' },
  pending: { bg: 'bg-warning-soft', text: 'text-warning', label: 'A receber' },
  cancelled: { bg: 'bg-ink-100', text: 'text-ink-500', label: 'Cancelado' },
};

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  const saleQuery = useQuery({
    queryKey: queryKeys.saleDetail(params.id),
    queryFn: () => getSale(params.id),
    // 404 "Venda não encontrada." (não existe ou é de outra loja) não adianta tentar de novo sozinho.
    retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 1,
  });

  // Pagar/cancelar mudam o total "a receber": invalida o resumo e a lista de Vendas (e o Painel,
  // que também mostra faturamento) pra refletirem sem precisar sair e voltar da tela.
  function invalidateAfterChange(updated: SaleDetail) {
    queryClient.setQueryData(queryKeys.saleDetail(params.id), updated);
    void queryClient.invalidateQueries({ queryKey: queryKeys.sales() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() });
  }

  const markPaidMutation = useMutation({
    mutationFn: () => markSalePaid(params.id),
    onSuccess: invalidateAfterChange,
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSale(params.id),
    onSuccess: (updated) => {
      invalidateAfterChange(updated);
      setCancelConfirming(false);
    },
    onError: (error) => {
      setActionError(getErrorMessage(error));
      setCancelConfirming(false);
    },
  });

  return (
    <div className="w-full">
      <PageHeader title="Detalhe da venda" subtitle={saleQuery.data ? `Venda #${saleQuery.data.number}` : undefined} backHref="/vendas" />

      {saleQuery.isPending && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-2xl border border-ink-100 bg-ink-50 lg:col-span-2" />
          <div className="h-56 animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />
        </div>
      )}

      {saleQuery.isError && (
        <div className="rounded-2xl border border-ink-100 p-10 text-center">
          <p className="mb-3 text-sm font-medium text-danger">{getErrorMessage(saleQuery.error)}</p>
          {!(saleQuery.error instanceof ApiError && saleQuery.error.status === 404) && (
            <button
              type="button"
              onClick={() => void saleQuery.refetch()}
              className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {saleQuery.data && (
        <SaleView
          sale={saleQuery.data}
          actionError={actionError}
          markingPaid={markPaidMutation.isPending}
          cancelling={cancelMutation.isPending}
          cancelConfirming={cancelConfirming}
          onMarkPaid={() => {
            setActionError(null);
            markPaidMutation.mutate();
          }}
          onAskCancel={() => {
            setActionError(null);
            setCancelConfirming(true);
          }}
          onCancelCancel={() => setCancelConfirming(false)}
          onConfirmCancel={() => cancelMutation.mutate()}
        />
      )}
    </div>
  );
}

function SaleView({
  sale,
  actionError,
  markingPaid,
  cancelling,
  cancelConfirming,
  onMarkPaid,
  onAskCancel,
  onCancelCancel,
  onConfirmCancel,
}: {
  sale: SaleDetail;
  actionError: string | null;
  markingPaid: boolean;
  cancelling: boolean;
  cancelConfirming: boolean;
  onMarkPaid: () => void;
  onAskCancel: () => void;
  onCancelCancel: () => void;
  onConfirmCancel: () => void;
}) {
  const statusStyle = STATUS_STYLE[sale.status];
  const isPending = sale.status === 'pending';
  const busy = markingPaid || cancelling;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        {actionError && (
          <p role="alert" className="animate-fade-up rounded-xl bg-danger-soft px-4 py-3 text-xs font-medium text-danger">
            {actionError}
          </p>
        )}

        <section className="rounded-2xl border border-ink-100 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-500 text-base font-bold text-white">
                {sale.customerName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-ink-900">{sale.customerName}</p>
                <p className="text-xs text-ink-400">
                  Venda #{sale.number} · {formatDateFull(sale.createdAt)} às {formatTime(sale.createdAt)}
                </p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-700">
              <Icon name={PAYMENT_ICON[sale.paymentMethod]} size={15} className="text-primary-500" />
              {paymentLabel(sale.paymentMethod, sale.installments)}
            </span>
            {sale.source === 'online' && (
              <span className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-700">
                <Icon name="globe" size={15} className="text-primary-500" />
                Pedido feito pela loja online
              </span>
            )}
            {sale.fulfillment && (
              <span className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-700">
                <Icon name={sale.fulfillment === 'delivery' ? 'car' : 'store'} size={15} className="text-primary-500" />
                {sale.fulfillment === 'delivery' ? 'Entrega' : 'Retirada na loja'}
              </span>
            )}
            {sale.customerWhatsapp && (
              <a
                href={whatsappUrl(sale.customerWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-xs font-semibold text-success transition hover:opacity-90"
              >
                <Icon name="externalLink" size={14} />
                Falar com o cliente · {formatWhatsapp(sale.customerWhatsapp)}
              </a>
            )}
          </div>

          {sale.fulfillment === 'delivery' && (
            <div className="mt-4 rounded-xl border border-ink-100 p-4">
              <p className="text-xs font-semibold text-ink-500">Endereço de entrega</p>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-900">{sale.deliveryAddress}</p>
              {sale.paymentMethod === 'cash' && (
                <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-900">
                  {sale.cashChangeFor !== null ? (
                    <>
                      <span className="font-semibold text-warning">Levar troco:</span> o cliente vai pagar com{' '}
                      <span className="font-semibold">{formatCurrency(sale.cashChangeFor)}</span> (troco de{' '}
                      <span className="font-semibold">{formatCurrency(Math.round((sale.cashChangeFor - sale.total) * 100) / 100)}</span>)
                    </>
                  ) : (
                    <span className="text-ink-600">Sem troco: o cliente vai pagar o valor exato.</span>
                  )}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Itens ({sale.items.length})</h2>
          {/* Nome, imagem e preço são os da época da venda: continuam aqui mesmo se o produto sair da loja. */}
          <ul className="flex flex-col gap-2.5">
            {sale.items.map((item, index) => (
              <li
                key={`${item.storeProductId ?? 'removido'}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-ink-100 p-3"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
                  {item.productImageSm ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.productImageSm} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="box" size={18} className="text-primary-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{item.productName}</span>
                  <span className="block text-xs text-ink-500">
                    {item.quantity}× {formatCurrency(item.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-ink-900">{formatCurrency(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section
          className={`rounded-2xl p-5 ${
            sale.status === 'paid' ? 'bg-success' : sale.status === 'cancelled' ? 'bg-ink-400' : 'bg-warning'
          }`}
        >
          <p className="text-sm font-semibold text-white/85">Total da venda</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{formatCurrency(sale.total)}</p>
        </section>

        {isPending && !cancelConfirming && (
          <>
            <button
              type="button"
              onClick={onMarkPaid}
              disabled={busy}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-primary-500 text-sm font-extrabold text-primary-600 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingPaid ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
              ) : (
                <>
                  <Icon name="check" size={16} strokeWidth={2.6} />
                  Marcar como recebido
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onAskCancel}
              disabled={busy}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon name="close" size={16} />
              Cancelar pedido
            </button>
          </>
        )}

        {isPending && cancelConfirming && (
          <div className="animate-fade-up rounded-2xl border border-danger/30 bg-danger-soft p-4">
            <p className="text-xs font-semibold text-danger">Cancelar este pedido?</p>
            <p className="mt-1 text-xs text-danger/80">O estoque reservado volta para a sua loja. Isso não pode ser desfeito.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onCancelCancel}
                disabled={cancelling}
                className="h-9 flex-1 rounded-lg border border-ink-200 bg-white text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={onConfirmCancel}
                disabled={cancelling}
                className="h-9 flex-1 rounded-lg bg-danger text-xs font-semibold text-white transition hover:bg-danger/90 disabled:opacity-60"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar pedido'}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
