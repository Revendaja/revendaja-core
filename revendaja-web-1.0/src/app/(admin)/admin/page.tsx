'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getAdminOverview } from '@/lib/api/admin';
import { getErrorMessage } from '@/lib/api/errors';
import { useCostInputs } from '@/lib/admin/hooks';
import { modelWithRealData } from '@/lib/admin/realModel';
import { PAID_PLAN_IDS, PLAN_IDS, PLAN_LABELS } from '@/lib/admin/costModel';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';
import {
  BarLabels,
  Bars,
  Delta,
  Kpi,
  Meter,
  PageHeader,
  QueryState,
  formatBrl,
  formatCompact,
  formatInt,
  formatPct,
  formatPeriod,
} from '@/components/admin/ui';

type Alert = { tone: 'bad' | 'warn' | 'info'; text: string };

const ALERT_STYLE: Record<Alert['tone'], string> = {
  bad: 'bg-danger-soft text-danger',
  warn: 'bg-warning-soft text-warning',
  info: 'bg-ink-50 text-ink-600',
};

function weekLabel(iso: string) {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function AdminOverviewPage() {
  const { inputs, loaded } = useCostInputs();
  const query = useQuery({ queryKey: ['admin', 'overview'], queryFn: getAdminOverview, refetchInterval: 60_000 });
  const overview = query.data;

  if (!overview || !loaded) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Visão geral" subtitle="Como a empresa está hoje." />
        <QueryState loading={query.isLoading || !loaded} error={query.error ? getErrorMessage(query.error) : null} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const real = modelWithRealData(inputs, overview);
  const { model } = real;
  const { stores, users, subscriptions, gmv, ai } = overview;
  const gmvNow = gmv.last30d;
  const onlineShare = gmvNow.paidSales > 0 ? (gmvNow.onlineSales / gmvNow.paidSales) * 100 : null;
  const activeShare = stores.total > 0 ? (stores.active30d / stores.total) * 100 : null;
  const payingShare = stores.total > 0 ? (stores.paying / stores.total) * 100 : null;
  const pastDue = subscriptions.byStatus.past_due ?? 0;

  const alerts: Alert[] = [];
  if (pastDue > 0) alerts.push({ tone: 'bad', text: `${pastDue} assinatura(s) com pagamento atrasado.` });
  if (subscriptions.cancelAtPeriodEnd > 0) {
    alerts.push({ tone: 'warn', text: `${subscriptions.cancelAtPeriodEnd} loja(s) vão cancelar no fim do período: vale entrar em contato.` });
  }
  if (activeShare !== null && stores.total >= 5 && activeShare < 30) {
    alerts.push({ tone: 'warn', text: `Só ${formatPct(activeShare, 0)} das lojas venderam nos últimos 30 dias.` });
  }
  if (real.profitReal < 0 && model.mrr > 0) {
    alerts.push({ tone: 'bad', text: `O resultado estimado do mês está negativo (${formatBrl(real.profitReal)}).` });
  }
  if (users.verified < users.total) {
    alerts.push({ tone: 'info', text: `${users.total - users.verified} conta(s) cadastradas sem e-mail verificado.` });
  }

  const weeks = overview.weekly;
  const labels = weeks.map((week) => weekLabel(week.weekStart));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Visão geral"
        subtitle={`Atualizado às ${new Date(overview.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Valores em R$ usam os preços do simulador de custos.`}
        right={
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
          >
            {query.isFetching ? 'Atualizando…' : 'Atualizar'}
          </button>
        }
      />

      <div className="flex flex-col gap-2">
        {alerts.length === 0 ? (
          <p className="rounded-xl bg-success-soft px-3 py-2 text-[13px] text-success">Nada pedindo atenção agora.</p>
        ) : (
          alerts.map((alert) => (
            <p key={alert.text} className={`rounded-xl px-3 py-2 text-[13px] ${ALERT_STYLE[alert.tone]}`}>
              {alert.text}
            </p>
          ))
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Lojas" value={formatInt(stores.total)} hint={`+${stores.new7d} em 7 dias · +${stores.new30d} em 30 dias`} />
        <Kpi
          label="Lojas pagantes"
          value={formatInt(stores.paying)}
          hint={`${formatPct(payingShare, 0)} da base · ${formatInt(stores.byPlan.free)} no Gratuito`}
        />
        <Kpi label="Receita mensal (MRR)" value={formatBrl(model.mrr)} hint={`${formatBrl(model.mrr * 12, 0)} por ano`} />
        <Kpi
          label="Resultado estimado do mês"
          value={formatBrl(real.profitReal)}
          tone={real.profitReal < 0 ? 'bad' : 'good'}
          hint={`após ${formatBrl(model.fixedBrl, 0)} fixos e ${formatBrl(real.variableReal)} variáveis`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Faturamento das lojas (30 dias)" />
          <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">{formatBrl(gmvNow.gross)}</p>
          <p className="mt-1 text-[12px]">
            <Delta current={gmvNow.gross} previous={gmv.previous30d.gross} />
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
            <div>
              <dt className="text-ink-400">Vendas pagas</dt>
              <dd className="font-semibold text-ink-900">{formatInt(gmvNow.paidSales)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Pela vitrine</dt>
              <dd className="font-semibold text-ink-900">{formatPct(onlineShare, 0)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Lojas vendendo</dt>
              <dd className="font-semibold text-ink-900">
                {formatInt(stores.active30d)} de {formatInt(stores.total)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[12px] text-ink-400">É o que as consultoras venderam, não a receita do Revendaja.</p>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Lojas por plano" />
          <ul className="mt-4 flex flex-col gap-3">
            {PLAN_IDS.map((id) => {
              const count = stores.byPlan[id];
              const monthly = model.plans[id].price * count;
              return (
                <li key={id}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-ink-800">{PLAN_LABELS[id]}</span>
                    <span className="text-ink-500">
                      {formatInt(count)} {count === 1 ? 'loja' : 'lojas'}
                      {monthly > 0 && <span className="ml-2 text-ink-900">{formatBrl(monthly)}/mês</span>}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Meter value={count} max={Math.max(1, stores.total)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Novas lojas por semana" />
          <div className="mt-4">
            <Bars data={weeks.map((week, i) => ({ label: labels[i], value: week.newStores }))} />
            <BarLabels labels={labels} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Novos cadastros por semana" />
          <div className="mt-4">
            <Bars color="bg-ink-400" data={weeks.map((week, i) => ({ label: labels[i], value: week.newUsers }))} />
            <BarLabels labels={labels} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Faturamento das lojas por semana" />
          <div className="mt-4">
            <Bars
              color="bg-success"
              format={(value) => formatBrl(value, 0)}
              data={weeks.map((week, i) => ({ label: labels[i], value: week.gmv }))}
            />
            <BarLabels labels={labels} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Assinaturas" />
          <ul className="mt-3 flex flex-col gap-2 text-[13px]">
            {Object.entries(subscriptions.byStatus).map(([status, count]) => (
              <li key={status} className="flex justify-between">
                <span className="text-ink-600">{status === 'sem_assinatura' ? 'Sem assinatura' : status}</span>
                <span className="font-semibold text-ink-900">{formatInt(count)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-ink-100 pt-2">
              <span className="text-ink-600">Cancelam no fim do período</span>
              <span className="font-semibold text-ink-900">{formatInt(subscriptions.cancelAtPeriodEnd)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink-600">Renovam em 7 dias</span>
              <span className="font-semibold text-ink-900">{formatInt(subscriptions.renewingIn7d)}</span>
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={`Assistente de IA · ${formatPeriod(ai.period)}`}
            right={
              <Link href="/admin/ia" className="text-[12px] font-medium text-primary-600 hover:underline">
                Detalhes
              </Link>
            }
          />
          <dl className="mt-3 flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-600">Mensagens</dt>
              <dd className="font-semibold text-ink-900">
                {formatInt(ai.current.messages)}
                <span className="ml-2 font-normal text-ink-400">mês anterior: {formatInt(ai.previous.messages)}</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Por voz</dt>
              <dd className="font-semibold text-ink-900">{formatInt(ai.current.transcriptions)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Tokens (entrada / saída)</dt>
              <dd className="font-semibold text-ink-900">
                {formatCompact(ai.current.inputTokens)} / {formatCompact(ai.current.outputTokens)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Lojas usando</dt>
              <dd className="font-semibold text-ink-900">{formatInt(ai.current.storesUsing)}</dd>
            </div>
            <div className="flex justify-between border-t border-ink-100 pt-2">
              <dt className="text-ink-600">Custo no mês</dt>
              <dd className="font-semibold text-ink-900">{formatBrl(real.aiReal)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Base e catálogo" />
          <dl className="mt-3 flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-600">Contas</dt>
              <dd className="font-semibold text-ink-900">
                {formatInt(users.total)} <span className="font-normal text-ink-400">({formatInt(users.verified)} verificadas)</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Vitrines online</dt>
              <dd className="font-semibold text-ink-900">{formatInt(stores.online)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Aparelhos com push (iOS / Android)</dt>
              <dd className="font-semibold text-ink-900">
                {formatInt(overview.devices.ios)} / {formatInt(overview.devices.android)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Produtos no catálogo</dt>
              <dd className="font-semibold text-ink-900">{formatInt(overview.catalog.products)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Marcas</dt>
              <dd className="font-semibold text-ink-900">{formatInt(overview.catalog.brands)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <p className="text-[12px] text-ink-400">
        Receita calculada com {PAID_PLAN_IDS.map((id) => `${PLAN_LABELS[id]} ${formatBrl(inputs.plans[id].price)}`).join(' · ')}.{' '}
        <Link href="/admin/custos" className="font-medium text-primary-600 hover:underline">
          Mudar preços e custos
        </Link>
      </p>
    </div>
  );
}
