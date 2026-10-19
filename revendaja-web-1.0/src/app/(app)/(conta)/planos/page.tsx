'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBilling, startCheckout, type PaidPlanId } from '@/lib/api/billing';
import { getStorePlan } from '@/lib/api/stores';
import { getErrorMessage } from '@/lib/api/errors';
import { redirectTo } from '@/lib/utils/navigation';
import { queryKeys } from '@/lib/api/queryKeys';
import { PLANS, findPlan, planRank, productsOverLimit, type PlanInfo } from '@/lib/data/plans';
import { Icon } from '@/components/dashboard/icons';
import { ConfirmDialog, FrozenWarning } from '@/components/ConfirmDialog';
import { OverLimitBanner } from '@/components/billing/OverLimitBanner';
import { Banner, PageHeader } from '@/components/products/FormParts';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function PlansPage() {
  return (
    <Suspense>
      <Plans />
    </Suspense>
  );
}

function Plans() {
  const queryClient = useQueryClient();
  const cancelled = useSearchParams().get('checkout') === 'cancelled';
  // Mesma query da Assinatura: o plano "atual" é sempre o valor real da API.
  const billingQuery = useQuery({ queryKey: queryKeys.billing(), queryFn: getBilling });
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  const billing = billingQuery.data;
  const currentPlanId = billing?.plan.id ?? null;
  const scheduled = billing?.scheduledChange ?? null;
  const hasSubscription = billing?.subscription != null && currentPlanId !== 'free';
  const productCount = planQuery.data?.usage.products ?? 0;

  const [notice, setNotice] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | null>(null);
  // Plano para o qual a pessoa pediu trocar e ainda precisa confirmar (só com assinatura ativa).
  const [confirming, setConfirming] = useState<PlanInfo | null>(null);

  const checkoutMutation = useMutation({
    mutationFn: (plan: PaidPlanId) => startCheckout(plan),
    onSuccess: async (result, plan) => {
      if (result.url) {
        // Vai para o pagamento na Stripe; ao voltar, a Assinatura confirma o plano.
        redirectTo(result.url);
        return;
      }
      // Troca na hora, downgrade agendado ou agendamento desfeito: relê o que depende do plano.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.billing() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.storePlan() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.home() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.storeSettings() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() }),
      ]);
      setPendingPlan(null);
      setConfirming(null);
      const name = findPlan(plan).name;
      setNotice({
        type: 'info',
        message: result.scheduledFor
          ? `Troca agendada: você continua no plano atual até ${longDate(result.scheduledFor)} e, a partir daí, passa para o ${name}. Nada é cobrado ou estornado agora.`
          : plan === currentPlanId
            ? `Tudo certo: você continua no plano ${name}.`
            : `Plano alterado para ${name}. A diferença proporcional até o fim do ciclo foi cobrada no seu cartão.`,
      });
    },
    onError: (error) => {
      setPendingPlan(null);
      setConfirming(null);
      setNotice({ type: 'error', message: getErrorMessage(error) });
    },
  });

  function submit(plan: PlanInfo) {
    if (plan.id === 'free') return;
    setNotice(null);
    setPendingPlan(plan.id);
    checkoutMutation.mutate(plan.id);
  }

  function handleChoose(plan: PlanInfo) {
    // Primeira assinatura: vai direto para o Checkout. Quem já assina confirma antes, porque a troca
    // mexe em cobrança (upgrade) ou em produtos (downgrade).
    if (hasSubscription && plan.id !== currentPlanId) setConfirming(plan);
    else submit(plan);
  }

  const confirmingDowngrade = confirming && currentPlanId ? planRank(confirming.id) < planRank(currentPlanId) : false;
  const frozenCount = confirming ? productsOverLimit(productCount, confirming.id) : 0;
  const periodEnd = billing?.subscription?.currentPeriodEnd ?? null;

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="Planos"
        subtitle="Escolha o plano que combina com o momento da sua revenda"
        backHref="/dashboard"
      />

      <OverLimitBanner showAction={false} />
      {cancelled && !notice && (
        <Banner type="info" message="Pagamento cancelado. Nada foi cobrado — você pode escolher um plano quando quiser." />
      )}
      {billing && !billing.configured && (
        <Banner type="info" message="A assinatura de planos ainda não está disponível. Fale com o suporte." />
      )}
      {scheduled && !notice && (
        <Banner
          type="info"
          message={`Troca agendada: no dia ${longDate(scheduled.effectiveAt)} seu plano passa para o ${findPlan(scheduled.plan).name}. Até lá você continua no ${billing?.plan.name}.`}
        />
      )}
      {notice && <Banner type={notice.type} message={notice.message} />}
      {billingQuery.isError && <Banner type="error" message={getErrorMessage(billingQuery.error)} />}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isFree = plan.id === 'free';
          const isScheduledTarget = scheduled?.plan === plan.id;
          const dark = !!plan.highlight;
          const busy = checkoutMutation.isPending && pendingPlan === plan.id;
          // O plano atual só é clicável para desfazer uma troca agendada.
          const canKeepCurrent = isCurrent && scheduled !== null && !isFree;
          const disabled =
            (isCurrent && !canKeepCurrent) ||
            isScheduledTarget ||
            billingQuery.isPending ||
            !billing?.configured ||
            checkoutMutation.isPending;

          const buttonClass = `mt-5 flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition disabled:cursor-not-allowed ${
            isCurrent && !canKeepCurrent
              ? dark
                ? 'bg-white/20 text-white'
                : 'bg-ink-100 text-ink-500'
              : dark
                ? 'bg-white text-primary-600 hover:bg-primary-50 disabled:opacity-60'
                : 'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60'
          }`;

          return (
            <section
              key={plan.id}
              className={`flex flex-col rounded-2xl border p-5 ${
                dark
                  ? 'border-primary-500 bg-primary-500 text-white shadow-[0_8px_24px_rgba(255,107,0,0.25)]'
                  : 'border-ink-100 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className={`text-[15px] font-semibold ${dark ? 'text-white' : 'text-ink-900'}`}>{plan.name}</h2>
                {(isCurrent || isScheduledTarget) && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      dark ? 'bg-white/20 text-white' : isScheduledTarget ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'
                    }`}
                  >
                    {isScheduledTarget ? 'Agendado' : 'Plano atual'}
                  </span>
                )}
              </div>
              <p className={`mt-1 text-xs ${dark ? 'text-white/80' : 'text-ink-500'}`}>{plan.tagline}</p>

              <p className="mt-4 flex items-end gap-1">
                <span className={`text-2xl font-semibold tracking-tight ${dark ? 'text-white' : 'text-ink-900'}`}>
                  {plan.priceLabel}
                </span>
                {plan.billingLabel && (
                  <span className={`mb-1 text-xs font-medium ${dark ? 'text-white/80' : 'text-ink-400'}`}>
                    {plan.billingLabel}
                  </span>
                )}
              </p>

              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs">
                    <Icon
                      name="check"
                      size={14}
                      strokeWidth={2.6}
                      className={`mt-0.5 shrink-0 ${dark ? 'text-white' : 'text-success'}`}
                    />
                    <span className={dark ? 'text-white/90' : 'text-ink-700'}>{feature}</span>
                  </li>
                ))}
              </ul>

              {isFree ? (
                // Voltar ao Gratuito é cancelar a assinatura, o que se faz em Assinatura.
                isCurrent ? (
                  <button type="button" disabled className={buttonClass}>
                    Plano atual
                  </button>
                ) : (
                  <Link href="/assinatura" className={`${buttonClass} bg-ink-100 text-ink-700 hover:bg-ink-200`}>
                    Cancelar na assinatura
                  </Link>
                )
              ) : (
                <button type="button" disabled={disabled} onClick={() => handleChoose(plan)} className={buttonClass}>
                  {busy
                    ? 'Aguarde...'
                    : canKeepCurrent
                      ? 'Manter este plano'
                      : isCurrent
                        ? 'Plano atual'
                        : isScheduledTarget
                          ? 'Troca agendada'
                          : hasSubscription
                            ? 'Trocar para este plano'
                            : 'Assinar este plano'}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirmingDowngrade ? `Mudar para o plano ${confirming.name}?` : `Fazer upgrade para o ${confirming.name}?`}
          confirmLabel={confirmingDowngrade ? 'Agendar mudança' : `Fazer upgrade (${confirming.priceLabel}/mês)`}
          busy={checkoutMutation.isPending}
          onConfirm={() => submit(confirming)}
          onCancel={() => setConfirming(null)}
        >
          {confirmingDowngrade ? (
            <>
              <p>
                Você já pagou o ciclo atual, então continua no plano {billing?.plan.name} até{' '}
                <strong className="text-ink-900">{periodEnd ? longDate(periodEnd) : 'o fim do ciclo'}</strong>. Só depois
                disso o plano muda para o {confirming.name}. Nada é cobrado ou estornado agora, e você pode desfazer
                antes dessa data.
              </p>
              {frozenCount > 0 && confirming.maxProducts !== null && (
                <FrozenWarning count={frozenCount} planName={confirming.name} limit={confirming.maxProducts} />
              )}
            </>
          ) : (
            <p>
              O novo plano vale agora. Cobramos no seu cartão só a diferença proporcional até o fim do ciclo atual, e
              nas próximas faturas o valor é de {confirming.priceLabel}/mês.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
