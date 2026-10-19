'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  createPortalSession,
  getBilling,
  startCheckout,
  type BillingInvoice,
  type BillingOverview,
  type PaidPlanId,
} from '@/lib/api/billing';
import { getStorePlan } from '@/lib/api/stores';
import { getErrorMessage } from '@/lib/api/errors';
import { redirectTo } from '@/lib/utils/navigation';
import { queryKeys } from '@/lib/api/queryKeys';
import { formatCurrency } from '@/lib/utils/format';
import { findPlan, productsOverLimit } from '@/lib/data/plans';
import { ConfirmDialog, FrozenWarning } from '@/components/ConfirmDialog';
import { OverLimitBanner } from '@/components/billing/OverLimitBanner';
import { Banner, PageHeader } from '@/components/products/FormParts';
import { Card } from '@/components/dashboard/overview/ui';

// Depois do pagamento a Stripe avisa o servidor por webhook, o que leva alguns segundos: a tela
// consulta de novo até o plano aparecer (ou desiste depois deste tempo).
const CONFIRM_POLL_MS = 2000;
const CONFIRM_GIVE_UP_MS = 30_000;

const INVOICE_STATUS: Record<BillingInvoice['status'], { label: string; pill: string; dot: string }> = {
  paid: { label: 'Pago', pill: 'bg-success-soft text-success', dot: 'bg-success' },
  open: { label: 'Em aberto', pill: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  uncollectible: { label: 'Não paga', pill: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  void: { label: 'Anulada', pill: 'bg-ink-100 text-ink-500', dot: 'bg-ink-400' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatLongDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  elo: 'Elo',
  hipercard: 'Hipercard',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

export default function SubscriptionPage() {
  return (
    <Suspense>
      <Subscription />
    </Suspense>
  );
}

function Subscription() {
  const { user, store } = useAuth();
  const queryClient = useQueryClient();
  const justPaid = useSearchParams().get('checkout') === 'success';
  const [startedAt] = useState(() => Date.now());

  const billingQuery = useQuery({
    queryKey: queryKeys.billing(),
    queryFn: getBilling,
    // Só consulta em intervalo enquanto espera o webhook confirmar o plano novo.
    refetchInterval: (query) =>
      justPaid && query.state.data?.plan.id === 'free' && Date.now() - startedAt < CONFIRM_GIVE_UP_MS
        ? CONFIRM_POLL_MS
        : false,
  });
  const billing = billingQuery.data;
  const planId = billing?.plan.id;

  // Plano confirmado: o que depende dele (painel, limites, configurações) precisa ser relido.
  useEffect(() => {
    if (!justPaid || !planId || planId === 'free') return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.storePlan() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.storeSettings() });
  }, [justPaid, planId, queryClient]);

  const [portalError, setPortalError] = useState<string | null>(null);
  const portalMutation = useMutation({
    mutationFn: createPortalSession,
    onSuccess: (result) => redirectTo(result.url),
    onError: (error) => setPortalError(getErrorMessage(error)),
  });
  function openPortal() {
    setPortalError(null);
    portalMutation.mutate();
  }

  // Reativar o plano ou desfazer uma troca agendada: é escolher de novo o plano atual.
  const keepMutation = useMutation({
    mutationFn: (plan: PaidPlanId) => startCheckout(plan),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.billing() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.storePlan() }),
      ]);
    },
    onError: (error) => setPortalError(getErrorMessage(error)),
  });
  function keepCurrentPlan() {
    if (!planId || planId === 'free') return;
    setPortalError(null);
    keepMutation.mutate(planId);
  }

  // Cancelar é no portal da Stripe, mas antes avisa o que acontece com os produtos acima do limite.
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  const [cancelDialog, setCancelDialog] = useState(false);
  const freeFrozen = productsOverLimit(planQuery.data?.usage.products ?? 0, 'free');
  const freeLimit = findPlan('free').maxProducts ?? 0;

  const currentPlan = findPlan(planId);
  const isPaidPlan = !!currentPlan.billingLabel;
  const canManage = !!billing?.configured && billing.subscription !== null;
  const confirming = justPaid && planId === 'free' && Date.now() - startedAt < CONFIRM_GIVE_UP_MS;

  return (
    <div className="w-full pb-16">
      <PageHeader title="Minha assinatura" subtitle="Gerencie seu plano, pagamento e faturas" backHref="/dashboard" />

      <OverLimitBanner />
      {justPaid && planId !== 'free' && <Banner type="info" message={`Pagamento confirmado! Seu plano ${currentPlan.name} já está ativo.`} />}
      {confirming && <Banner type="info" message="Pagamento recebido! Estamos confirmando o seu plano, isso leva alguns segundos." />}
      {justPaid && planId === 'free' && !confirming && (
        <Banner type="info" message="Seu pagamento ainda está sendo processado. Se o plano não mudar em alguns minutos, fale com o suporte." />
      )}
      {portalError && <Banner type="error" message={portalError} />}
      {billing && !billing.configured && (
        <Banner type="info" message="A cobrança ainda não está disponível neste ambiente." />
      )}

      {billingQuery.isError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3">
          <p role="alert" className="text-xs font-medium text-danger">
            {getErrorMessage(billingQuery.error)}
          </p>
          <button
            type="button"
            onClick={() => void billingQuery.refetch()}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Plano */}
        <Card>
          <SectionTitle title="Seu plano" subtitle="Gerencie o plano da sua loja." />

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {billingQuery.isPending ? (
                  <div className="h-8 w-28 animate-pulse rounded-lg bg-ink-100" />
                ) : (
                  <p className="text-2xl font-semibold tracking-tight text-ink-900">{currentPlan.name}</p>
                )}
                {billing && <StatusBadge billing={billing} />}
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {isPaidPlan ? `${currentPlan.priceLabel} por mês · cobrado mensalmente` : 'Plano gratuito · sem cobrança'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/planos"
                className="flex h-10 items-center rounded-xl border border-ink-200 px-4 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                Trocar plano
              </Link>
              {planId !== 'business' && (
                <Link
                  href="/planos"
                  className="flex h-10 items-center rounded-xl bg-primary-500 px-4 text-xs font-semibold text-white transition hover:bg-primary-600"
                >
                  Fazer upgrade
                </Link>
              )}
            </div>
          </div>

          {billing?.subscription && isPaidPlan && billing.subscription.currentPeriodEnd && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-4 text-xs text-ink-500">
              <p className="flex items-center gap-2">
                <CalendarIcon />
                {billing.subscription.cancelAtPeriodEnd ? (
                  <span>
                    Cancelamento agendado: você mantém o plano até{' '}
                    <strong className="font-semibold text-ink-900">
                      {formatLongDate(billing.subscription.currentPeriodEnd)}
                    </strong>
                  </span>
                ) : (
                  <span>
                    Renova em{' '}
                    <strong className="font-semibold text-ink-900">
                      {formatLongDate(billing.subscription.currentPeriodEnd)}
                    </strong>
                  </span>
                )}
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={billing.subscription.cancelAtPeriodEnd ? keepCurrentPlan : () => setCancelDialog(true)}
                  disabled={portalMutation.isPending || keepMutation.isPending}
                  className="font-medium text-ink-500 transition hover:text-danger disabled:opacity-60"
                >
                  {billing.subscription.cancelAtPeriodEnd ? 'Reativar plano' : 'Cancelar plano'}
                </button>
              )}
            </div>
          )}
          {billing?.scheduledChange && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-xs text-warning">
              <p className="font-medium">
                Troca agendada: em{' '}
                <strong className="font-semibold">{formatLongDate(billing.scheduledChange.effectiveAt)}</strong> seu
                plano passa para o {findPlan(billing.scheduledChange.plan).name}.
              </p>
              <button
                type="button"
                onClick={keepCurrentPlan}
                disabled={keepMutation.isPending}
                className="font-semibold underline disabled:opacity-60"
              >
                {keepMutation.isPending ? 'Desfazendo...' : 'Desfazer'}
              </button>
            </div>
          )}
          {billing && !isPaidPlan && (
            <p className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-500">
              Assine um plano pago para desbloquear mais recursos da sua loja.
            </p>
          )}
        </Card>

        {/* Forma de pagamento + dados de cobrança */}
        {billing?.paymentMethod && (
          <Card>
            <SectionTitle title="Forma de pagamento" subtitle="Cobrada automaticamente no início de cada ciclo." />

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 px-4 py-3">
              <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md bg-ink-900 text-[9px] font-bold uppercase tracking-wider text-white" aria-hidden>
                {billing.paymentMethod.brand.slice(0, 4)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold text-ink-900">•••• •••• •••• {billing.paymentMethod.last4}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {BRAND_LABEL[billing.paymentMethod.brand] ?? billing.paymentMethod.brand} · Vence em{' '}
                  {String(billing.paymentMethod.expMonth).padStart(2, '0')}/{billing.paymentMethod.expYear}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={portalMutation.isPending}
                  className="h-8 rounded-lg border border-ink-200 px-3 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60"
                >
                  {portalMutation.isPending ? 'Abrindo...' : 'Alterar'}
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <Label>Cobrado em nome de</Label>
                <p className="mt-1.5 text-sm font-semibold text-ink-900">{user?.name ?? '—'}</p>
                <p className="text-xs text-ink-500">{store?.storeName ?? '—'}</p>
              </div>
              <div>
                <Label>E-mail de cobrança</Label>
                <p className="mt-1.5 text-sm font-semibold text-ink-900">{billing.billingEmail ?? user?.email ?? '—'}</p>
                <p className="text-xs text-ink-500">Faturas e recibos são enviados para cá.</p>
              </div>
            </div>
          </Card>
        )}

        {/* Faturas */}
        {(billingQuery.isPending || isPaidPlan || (billing?.invoices.length ?? 0) > 0) && (
          <Card>
            <SectionTitle title="Faturas" subtitle="Baixe os recibos para o seu controle." />

            {billingQuery.isPending ? (
              <div className="mt-4 h-24 animate-pulse rounded-xl bg-ink-50" />
            ) : billing && billing.invoices.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">Nenhuma fatura registrada ainda.</p>
            ) : (
              billing && <InvoicesTable invoices={billing.invoices} />
            )}
          </Card>
        )}
      </div>

      {cancelDialog && (
        <ConfirmDialog
          title="Cancelar a assinatura?"
          confirmLabel="Continuar para o cancelamento"
          tone="danger"
          busy={portalMutation.isPending}
          onConfirm={openPortal}
          onCancel={() => setCancelDialog(false)}
        >
          <p>
            Você mantém o plano {currentPlan.name} até o fim do ciclo já pago
            {billing?.subscription?.currentPeriodEnd
              ? ` (${formatLongDate(billing.subscription.currentPeriodEnd)})`
              : ''}
            . Depois disso a loja volta ao plano Gratuito. O cancelamento é concluído na página segura da Stripe.
          </p>
          {freeFrozen > 0 && <FrozenWarning count={freeFrozen} planName="Gratuito" limit={freeLimit} />}
        </ConfirmDialog>
      )}
    </div>
  );
}

function InvoicesTable({ invoices }: { invoices: BillingInvoice[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-130 text-left text-xs">
        <thead className="bg-ink-50 text-ink-500">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Data</th>
            <th className="px-4 py-2.5 font-semibold">Fatura</th>
            <th className="px-4 py-2.5 font-semibold">Valor</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {invoices.map((invoice) => {
            const status = INVOICE_STATUS[invoice.status];
            const link = invoice.pdfUrl ?? invoice.hostedUrl;
            return (
              <tr key={invoice.id}>
                <td className="px-4 py-3 text-ink-700">{formatDate(invoice.date)}</td>
                <td className="px-4 py-3 font-mono text-ink-500">{invoice.number ?? '—'}</td>
                <td className="px-4 py-3 font-semibold text-ink-900">{formatCurrency(invoice.amount)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${status.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary-600 hover:underline"
                    >
                      {invoice.pdfUrl ? 'PDF' : 'Ver'}
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ billing }: { billing: BillingOverview }) {
  const status = billing.subscription?.status;
  if (!status || status === 'canceled') {
    return null;
  }
  const meta =
    status === 'past_due'
      ? { label: 'Pagamento pendente', pill: 'bg-warning-soft text-warning', dot: 'bg-warning' }
      : billing.subscription?.cancelAtPeriodEnd
        ? { label: 'Cancela no fim do ciclo', pill: 'bg-ink-100 text-ink-600', dot: 'bg-ink-400' }
        : { label: status === 'trialing' ? 'Em teste' : 'Ativo', pill: 'bg-success-soft text-success', dot: 'bg-success' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="leading-tight">
      <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
      <p className="mt-1 text-xs text-ink-400">{subtitle}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{children}</p>;
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
