'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelSale, getSale, markSalePaid, updateSale } from '@/lib/api/sales';
import { queryKeys } from '@/lib/api/queryKeys';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import type { NewSalePaymentMethod, SaleDetail, SaleStatusValue, UpdateSaleInput } from '@/lib/api/types';
import { formatCurrency, formatWhatsapp, whatsappUrl } from '@/lib/utils/format';
import { buildCustomerMessage } from '@/lib/utils/saleMessage';
import { formatDateFull, formatTime, PAYMENT_CHIPS, PAYMENT_ICON, paymentLabel, roundMoney } from '@/lib/utils/sales';
import { Icon } from '@/components/dashboard/icons';
import { PageHeader } from '@/components/products/FormParts';

const STATUS_STYLE: Record<SaleStatusValue, { bg: string; text: string; label: string }> = {
  paid: { bg: 'bg-success-soft', text: 'text-success', label: 'Recebido' },
  pending: { bg: 'bg-warning-soft', text: 'text-warning', label: 'A receber' },
  cancelled: { bg: 'bg-ink-100', text: 'text-ink-500', label: 'Cancelado' },
};

// Data local no formato do <input type="date"> (AAAA-MM-DD).
function toInputDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { store } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  const updateMutation = useMutation({
    mutationFn: (input: UpdateSaleInput) => updateSale(params.id, input),
    onSuccess: (updated) => {
      invalidateAfterChange(updated);
      setEditing(false);
    },
    onError: (error) => setEditError(getErrorMessage(error)),
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
          storeName={store?.storeName ?? null}
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
          editing={editing}
          editError={editError}
          saving={updateMutation.isPending}
          onStartEdit={() => {
            setEditError(null);
            setEditing(true);
          }}
          onCancelEdit={() => setEditing(false)}
          onSaveEdit={(input) => {
            setEditError(null);
            updateMutation.mutate(input);
          }}
        />
      )}
    </div>
  );
}

function SaleView({
  storeName,
  sale,
  actionError,
  markingPaid,
  cancelling,
  cancelConfirming,
  onMarkPaid,
  onAskCancel,
  onCancelCancel,
  onConfirmCancel,
  editing,
  editError,
  saving,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  // Nome da loja, para a mensagem pronta do WhatsApp.
  storeName: string | null;
  editing: boolean;
  editError: string | null;
  saving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (input: UpdateSaleInput) => void;
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
                href={whatsappUrl(sale.customerWhatsapp, buildCustomerMessage(sale, storeName))}
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
          {sale.discount > 0 && (
            <div className="mb-3 flex flex-col gap-1 border-b border-white/25 pb-3 text-xs text-white/85">
              <p className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(roundMoney(sale.total + sale.discount))}</span>
              </p>
              <p className="flex items-center justify-between font-semibold">
                <span>Cupom {sale.couponCode}</span>
                <span>−{formatCurrency(sale.discount)}</span>
              </p>
            </div>
          )}
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

        {sale.status !== 'cancelled' && !editing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white text-sm font-extrabold text-ink-700 transition hover:bg-ink-50"
          >
            Editar venda
          </button>
        )}

        {editing && <EditSaleForm sale={sale} error={editError} saving={saving} onCancel={onCancelEdit} onSave={onSaveEdit} />}
      </aside>
    </div>
  );
}

function EditSaleForm({
  sale,
  error,
  saving,
  onCancel,
  onSave,
}: {
  sale: SaleDetail;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (input: UpdateSaleInput) => void;
}) {
  const originalDate = toInputDate(new Date(sale.createdAt));
  const [name, setName] = useState(sale.customerName);
  const [date, setDate] = useState(originalDate);
  // Venda antiga em "fiado" começa em Pix, mas só envia se o usuário trocar de fato.
  const [payment, setPayment] = useState<NewSalePaymentMethod>(sale.paymentMethod === 'on_account' ? 'pix' : sale.paymentMethod);
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) {
      setLocalError('Informe o nome do cliente (até 120 caracteres).');
      return;
    }
    const input: UpdateSaleInput = {};
    if (trimmed !== sale.customerName) input.customerName = trimmed;
    if (payment !== sale.paymentMethod) input.paymentMethod = payment;
    // Só envia a data se ela mudou: assim a hora original da venda é preservada.
    if (date !== originalDate) {
      const [y, m, d] = date.split('-').map(Number);
      const now = new Date();
      const chosen = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
      if (!date || Number.isNaN(chosen.getTime()) || chosen.getTime() > now.getTime()) {
        setLocalError('Informe uma data válida (não pode ser no futuro).');
        return;
      }
      input.soldAt = chosen.toISOString();
    }
    if (Object.keys(input).length === 0) {
      onCancel();
      return;
    }
    setLocalError(null);
    onSave(input);
  }

  const shownError = localError ?? error;

  return (
    <form onSubmit={submit} className="animate-fade-up rounded-2xl border border-ink-100 bg-white p-4" noValidate>
      <p className="text-sm font-semibold text-ink-900">Editar venda #{sale.number}</p>
      <p className="mb-3 text-xs text-ink-400">Os produtos e o total não mudam.</p>

      <label htmlFor="edit-name" className="mb-1 block text-xs font-semibold text-ink-600">
        Nome do cliente
      </label>
      <input
        id="edit-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={120}
        disabled={saving}
        className="h-11 w-full rounded-xl border border-ink-100 bg-white px-3 text-sm text-ink-900 disabled:opacity-60"
      />

      <label htmlFor="edit-date" className="mb-1 mt-3 block text-xs font-semibold text-ink-600">
        Data da venda
      </label>
      <input
        id="edit-date"
        type="date"
        value={date}
        max={toInputDate(new Date())}
        onChange={(event) => setDate(event.target.value)}
        disabled={saving}
        className="h-11 w-full rounded-xl border border-ink-100 bg-white px-3 text-sm text-ink-900 disabled:opacity-60"
      />

      <p className="mb-1.5 mt-3 text-xs font-semibold text-ink-600">Forma de pagamento</p>
      <div className="flex flex-wrap gap-2">
        {PAYMENT_CHIPS.map(({ method, label }) => (
          <button
            key={method}
            type="button"
            onClick={() => setPayment(method)}
            disabled={saving}
            aria-pressed={method === payment}
            className={`h-9 rounded-full px-4 text-xs font-semibold transition disabled:opacity-60 ${
              method === payment ? 'bg-primary-500 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shownError && (
        <p role="alert" className="mt-3 text-xs font-medium text-danger">
          {shownError}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-10 flex-1 rounded-lg border border-ink-200 bg-white text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="h-10 flex-1 rounded-lg bg-primary-500 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
