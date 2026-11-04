'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdminAi, getAdminOverview, getAdminPlans } from '@/lib/api/admin';
import { getErrorMessage } from '@/lib/api/errors';
import { useCostInputs } from '@/lib/admin/hooks';
import { EDITABLE_PLAN_IDS } from '@/lib/admin/editable';
import { applyRealData } from '@/lib/admin/realModel';
import {
  AI_MODEL_PRESETS,
  CHANNEL_IDS,
  CHANNEL_LABELS,
  PAID_PLAN_IDS,
  PLAN_IDS,
  PLAN_LABELS,
  computeModel,
  type PlanId,
} from '@/lib/admin/costModel';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';
import { NumField } from '@/components/admin/NumField';
import {
  Badge,
  LineChart,
  Meter,
  PageHeader,
  PairBars,
  QueryState,
  StackedBar,
  Table,
  formatBrl,
  formatInt,
  formatPct,
} from '@/components/admin/ui';

const SERVICE_FIELDS = [
  { key: 'server', label: 'Servidor (Fly.io)', hint: 'Soma de todas as máquinas.' },
  { key: 'database', label: 'Banco de dados (Neon)', hint: 'R$ 0 se estiver no plano gratuito.' },
  { key: 'queue', label: 'Fila (Redis)', hint: 'R$ 0 se estiver no plano gratuito.' },
] as const;

const chip = 'rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50';

export default function AdminCostsPage() {
  const { inputs, editable, setPrice, setService, setChannelShare, reset, loaded } = useCostInputs();

  const overviewQuery = useQuery({ queryKey: ['admin', 'overview'], queryFn: getAdminOverview });
  const aiQuery = useQuery({ queryKey: ['admin', 'ai', 'current'], queryFn: () => getAdminAi() });
  const plansQuery = useQuery({ queryKey: ['admin', 'plans'], queryFn: getAdminPlans });

  const overview = overviewQuery.data;
  if (!overview || !loaded) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Custos e planos" subtitle="Quanto entra, quanto sai e quanto sobra." />
        <QueryState
          loading={overviewQuery.isLoading || !loaded}
          error={overviewQuery.error ? getErrorMessage(overviewQuery.error) : null}
          onRetry={() => void overviewQuery.refetch()}
        />
      </div>
    );
  }

  // Tudo o que não é preço ou custo editável vem do sistema: lojas por plano, uso real de IA...
  const real = applyRealData(inputs, overview, aiQuery.data);
  const model = computeModel(real.inputs);
  const sol = computeModel({ ...real.inputs, ai: { ...real.inputs.ai, ...AI_MODEL_PRESETS.sol } });
  const luna = computeModel({ ...real.inputs, ai: { ...real.inputs.ai, ...AI_MODEL_PRESETS.luna } });

  const weighted = (pick: (id: PlanId) => number) => PLAN_IDS.reduce((sum, id) => sum + pick(id) * model.plans[id].subscribers, 0);
  const shareSum = CHANNEL_IDS.reduce((sum, channel) => sum + editable.channelShares[channel], 0);
  const taxes = weighted((id) => model.plans[id].tax);
  const storefront = weighted((id) => model.plans[id].other);
  const fixed = Object.fromEntries(model.fixedBreakdown.map((item) => [item.label.split(' (')[0], item.value]));
  const totalCost = model.variableCost + model.fixedBrl;
  const profit = model.profit;

  const aiShare = model.mrr > 0 ? (model.aiTotal / model.mrr) * 100 : null;
  const planLimits = plansQuery.data?.plans ?? [];

  // Gráfico "quando a conta fecha": resultado por mês conforme cresce o número de pagantes.
  const breakEven = model.breakEvenInfra;
  const chartMax = Math.max(20, Math.ceil(((breakEven ?? 10) * 2) / 5) * 5, Math.ceil((model.payingStores * 1.5) / 5) * 5);
  const curve = Array.from({ length: chartMax + 1 }, (_, n) => ({ x: n, y: n * model.netPerPayer - model.fixedBrl }));
  const missing = breakEven === null ? null : Math.max(0, breakEven - model.payingStores);

  const verdict =
    model.mrr === 0
      ? `Ainda não há lojas pagantes: os custos fixos de ${formatBrl(model.fixedBrl, 0)} por mês estão saindo do seu bolso.`
      : profit >= 0
        ? `A operação se paga e sobra ${formatBrl(profit)} por mês (margem de ${formatPct(model.netMarginPct, 0)}).`
        : `Faltam ${formatBrl(-profit)} por mês para a operação se pagar. O gráfico de equilíbrio mostra quantos assinantes resolvem.`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Custos e planos"
        subtitle="Quanto entra, quanto sai e quanto sobra, com as lojas e o uso de IA reais do sistema. Você só edita o preço dos planos e o que paga pelos serviços."
      />

      {/* 1 — A resposta em uma frase */}
      <Card>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
          <div>
            <p className="text-[12px] font-medium text-ink-500">Entra por mês (mensalidades)</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">{formatBrl(model.mrr)}</p>
            <p className="mt-1 text-[12px] text-ink-400">
              {formatInt(model.payingStores)} loja(s) pagante(s) · {formatInt(model.freeStores)} gratuita(s)
            </p>
          </div>
          <span className="hidden text-2xl text-ink-300 sm:block">−</span>
          <div>
            <p className="text-[12px] font-medium text-ink-500">Sai por mês (custos)</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">{formatBrl(totalCost)}</p>
            <p className="mt-1 text-[12px] text-ink-400">
              {formatBrl(model.fixedBrl, 0)} fixos + {formatBrl(model.variableCost)} que crescem com os clientes
            </p>
          </div>
          <span className="hidden text-2xl text-ink-300 sm:block">=</span>
          <div>
            <p className="text-[12px] font-medium text-ink-500">Sobra por mês</p>
            <p className={`mt-1 text-3xl font-semibold tracking-tight ${profit < 0 ? 'text-danger' : 'text-success'}`}>{formatBrl(profit)}</p>
            <p className="mt-1 text-[12px] text-ink-400">já descontado o imposto do MEI; antes do seu tempo</p>
          </div>
        </div>
        <p className={`mt-4 rounded-xl px-3 py-2 text-[13px] ${profit < 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{verdict}</p>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-400">
          De onde vêm os números:
          <Badge tone="good">lojas por plano: medido</Badge>
          <Badge tone={real.aiSource === 'medido' ? 'good' : 'warn'}>uso de IA: {real.aiSource === 'medido' ? 'medido neste mês' : 'estimado (ainda sem mensagens)'}</Badge>
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* 2 — Para onde vai o dinheiro */}
        <Card className="lg:col-span-7">
          <CardHeader title="Para onde vai o dinheiro" />
          <p className="mb-4 mt-1 text-[12px] text-ink-400">
            {profit >= 0
              ? 'A receita do mês dividida entre cada custo e o que sobra.'
              : 'Os custos passam da receita: não há lucro neste mês.'}
          </p>
          <StackedBar
            total={Math.max(model.mrr, totalCost)}
            segments={[
              { label: 'Servidor, banco, fila, contas fixas e imposto do MEI', value: model.fixedBrl, color: 'bg-ink-700', hint: `Servidor ${formatBrl(fixed['Servidor'] ?? 0, 0)} · banco ${formatBrl(fixed['Banco'] ?? 0, 0)} · fila ${formatBrl(fixed['Fila'] ?? 0, 0)} · Apple e domínio ${formatBrl((fixed['Conta Apple Developer'] ?? 0) + (fixed['Domínio e extras'] ?? 0), 0)} · imposto MEI ${formatBrl(fixed['Imposto MEI'] ?? 0)}` },
              { label: 'Assistente de IA (chat e voz)', value: model.aiTotal, color: 'bg-primary-500', hint: aiShare === null ? undefined : `${formatPct(aiShare)} da receita` },
              { label: `Comissão da Stripe (${formatPct(inputs.channels.stripe.pct, 2)} + ${formatBrl(inputs.channels.stripe.fixedBrl)})`, value: model.channelFees.stripe, color: 'bg-warning' },
              { label: `Comissão da Apple (${formatPct(inputs.channels.apple.pct, 0)})`, value: model.channelFees.apple, color: 'bg-danger' },
              { label: `Comissão do Google Play (${formatPct(inputs.channels.google.pct, 0)})`, value: model.channelFees.google, color: 'bg-ink-500' },
              { label: 'Impostos sobre a receita', value: taxes, color: 'bg-ink-400' },
              { label: 'Vitrine e imagens', value: storefront, color: 'bg-ink-300' },
              { label: 'Lucro', value: profit, color: 'bg-success', hint: 'O que sobra para você' },
            ]}
          />
        </Card>

        {/* 3 — O que você controla */}
        <Card className="lg:col-span-5">
          <CardHeader
            title="O que você controla"
            right={
              <button type="button" className={chip} onClick={reset}>
                Restaurar
              </button>
            }
          />
          <p className="mb-3 mt-1 text-[12px] text-ink-400">Só estes valores são editáveis. O resto o sistema calcula ou já é fixo.</p>

          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Mensalidade de cada plano</p>
          <div className="mt-2 grid grid-cols-3 gap-2.5">
            {EDITABLE_PLAN_IDS.map((id) => (
              <NumField key={id} label={PLAN_LABELS[id]} prefix="R$" step={0.01} value={editable.prices[id]} onChange={(value) => setPrice(id, value)} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-400">O Gratuito é sempre R$ 0. O preço cobrado de verdade é o da Stripe: este serve para as projeções.</p>

          <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-500">O que você paga por mês pelos serviços</p>
          <div className="mt-2 grid gap-2.5">
            {SERVICE_FIELDS.map((field) => (
              <NumField
                key={field.key}
                label={field.label}
                prefix="US$"
                suffix="/mês"
                step={0.5}
                hint={field.hint}
                value={editable.servicesUsd[field.key]}
                onChange={(value) => setService(field.key, value)}
              />
            ))}
          </div>

          <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-500">Por onde seus assinantes pagam</p>
          <div className="mt-2 grid grid-cols-3 gap-2.5">
            {CHANNEL_IDS.map((channel) => (
              <NumField
                key={channel}
                label={CHANNEL_LABELS[channel]}
                suffix="%"
                scale={100}
                max={1}
                value={editable.channelShares[channel]}
                onChange={(value) => setChannelShare(channel, value)}
              />
            ))}
          </div>
          <p className={`mt-1 text-[11px] ${Math.abs(shareSum - 1) > 0.005 ? 'text-warning' : 'text-ink-400'}`}>
            Soma: {formatPct(shareSum * 100, 0)}.{' '}
            {Math.abs(shareSum - 1) > 0.005
              ? 'Não fecha 100%: o sistema ajusta proporcionalmente.'
              : 'O sistema ainda só conhece a Stripe: esta divisão é a sua estimativa.'}
          </p>
        </Card>
      </div>

      {/* 4 — Cada cliente */}
      <Card>
        <CardHeader title="Quanto cada cliente rende" />
        <p className="mb-4 mt-1 text-[12px] text-ink-400">Em cada plano: o que a loja paga, o que ela custa para você e o que sobra, por mês.</p>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <PairBars
              aLabel="Paga"
              bLabel="Custa"
              data={PAID_PLAN_IDS.map((id) => ({ label: PLAN_LABELS[id], a: model.plans[id].price, b: model.plans[id].total }))}
            />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
            {PLAN_IDS.map((id) => {
              const plan = model.plans[id];
              return (
                <li key={id} className="rounded-xl border border-ink-100 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] font-semibold text-ink-900">{PLAN_LABELS[id]}</p>
                    <Badge>{formatInt(plan.subscribers)} loja(s)</Badge>
                  </div>
                  {plan.price > 0 ? (
                    <>
                      <p className="mt-2 text-[13px] text-ink-600">
                        Cada loja <b className="text-ink-900">paga {formatBrl(plan.price)}</b> e custa{' '}
                        <b className="text-ink-900">{formatBrl(plan.total)}</b>.
                      </p>
                      <p className="mt-1 text-[13px] text-ink-600">
                        Sobra <b className={plan.contribution < 0 ? 'text-danger' : 'text-success'}>{formatBrl(plan.contribution)}</b> ({formatPct(plan.marginPct, 0)}).
                      </p>
                      <div className="mt-2">
                        <Meter value={Math.max(0, plan.contribution)} max={plan.price} tone="good" />
                      </div>
                      <p className="mt-2 text-[11px] text-ink-400">
                        No pior caso (usa toda a cota de IA, por voz): sobra {formatBrl(plan.worstContribution)} ({formatPct(plan.worstMarginPct, 0)}).
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-[13px] text-ink-600">
                      Não paga nada e custa <b className="text-ink-900">{formatBrl(plan.total)}</b> por loja. É o investimento para a loja
                      conhecer o app e virar assinante.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      {/* 4b — Por canal e MEI */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Quanto sobra por canal de venda" />
          <p className="mb-3 mt-1 text-[12px] text-ink-400">O que fica com você de cada mensalidade, depois da comissão de cada canal.</p>
          <Table head={['Plano', ...CHANNEL_IDS.map((channel) => CHANNEL_LABELS[channel])]}>
            {PAID_PLAN_IDS.map((id) => {
              const price = model.plans[id].price;
              return (
                <tr key={id}>
                  <td className="px-3 py-2.5 font-medium text-ink-900">{PLAN_LABELS[id]}</td>
                  {CHANNEL_IDS.map((channel) => {
                    const { pct, fixedBrl } = inputs.channels[channel];
                    const fee = (price * pct) / 100 + fixedBrl;
                    return (
                      <td key={channel} className="px-3 py-2.5 text-ink-800">
                        {formatBrl(price - fee)}
                        <span className="block text-[11px] text-ink-400">comissão {formatBrl(fee)} ({formatPct((fee / Math.max(price, 0.01)) * 100, 1)})</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </Table>
          <p className="mt-3 text-[12px] text-ink-400">
            Cobrar pelo site (Stripe) deixa mais dinheiro com você do que pelas lojas de aplicativos. A Apple só cobra 15% de quem
            está no programa para pequenos desenvolvedores: é preciso se inscrever.
          </p>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Limite do MEI" right={<Badge tone={model.meiLimitUsedPct >= 90 ? 'bad' : model.meiLimitUsedPct >= 70 ? 'warn' : 'good'}>{formatPct(model.meiLimitUsedPct, 0)} do teto</Badge>} />
          <p className="mb-3 mt-1 text-[12px] text-ink-400">
            O MEI paga um valor fixo por mês ({formatBrl(inputs.mei.monthlyBrl)}) e pode faturar até {formatBrl(inputs.mei.annualLimitBrl, 0)} por ano.
          </p>
          <Meter value={model.annualRevenue} max={inputs.mei.annualLimitBrl} tone={model.meiLimitUsedPct >= 90 ? 'bad' : model.meiLimitUsedPct >= 70 ? 'warn' : 'good'} />
          <p className="mt-2 text-[13px] text-ink-700">
            Em 12 meses, as mensalidades somam <b className="text-ink-900">{formatBrl(model.annualRevenue, 0)}</b>.
          </p>
          <p className="mt-1 text-[12px] text-ink-400">
            {model.meiLimitUsedPct >= 100
              ? 'Passou do teto: é preciso deixar de ser MEI (virar microempresa), com outros impostos.'
              : `Ainda cabem ${formatBrl(inputs.mei.annualLimitBrl - model.annualRevenue, 0)} no ano antes de precisar mudar de enquadramento.`}
          </p>
        </Card>
      </div>

      {/* 5 — Quando a conta fecha */}
      <Card>
        <CardHeader title="Quando a conta fecha" />
        {model.netPerPayer > 0 ? (
          <>
            <p className="mb-3 mt-1 text-[12px] text-ink-400">
              Quanto sobra por mês conforme entram assinantes pagantes. Cada novo assinante soma cerca de{' '}
              <b className="text-ink-700">{formatBrl(model.netPerPayer)}</b> por mês.
            </p>
            <LineChart
              xLabel="Lojas pagantes"
              points={curve}
              marker={{ x: Math.min(model.payingStores, chartMax), y: profit, label: `Hoje: ${formatBrl(profit, 0)}` }}
              vline={breakEven === null ? undefined : { x: Math.min(breakEven, chartMax), label: `equilíbrio: ${breakEven}` }}
            />
            <div className="mt-3 rounded-xl bg-ink-50 p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                <p className="text-ink-700">
                  Você tem <b className="text-ink-900">{formatInt(model.payingStores)}</b> pagante(s); precisa de{' '}
                  <b className="text-ink-900">{breakEven === null ? '—' : formatInt(breakEven)}</b> para cobrir os custos fixos.
                </p>
                <p className={missing === 0 ? 'font-semibold text-success' : 'font-semibold text-warning'}>
                  {missing === null ? '' : missing === 0 ? 'Meta de equilíbrio atingida' : `Faltam ${formatInt(missing)}`}
                </p>
              </div>
              <div className="mt-2">
                <Meter value={model.payingStores} max={breakEven ?? 1} tone={missing === 0 ? 'good' : 'warn'} />
              </div>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
            Com os preços atuais, cada assinante custa mais do que paga: aumentar clientes não fecha a conta. Revise o preço dos planos.
          </p>
        )}
      </Card>

      {/* 6 — IA */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="O quanto a IA pesa" />
          <dl className="mt-3 flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-600">Custo de IA no mês</dt>
              <dd className="font-semibold text-ink-900">{formatBrl(model.aiTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Parte da receita</dt>
              <dd className="font-semibold text-ink-900">{formatPct(aiShare)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Custo de uma mensagem</dt>
              <dd className="font-semibold text-ink-900">{formatBrl(model.perMessageBrl, 4)}</dd>
            </div>
            <p className="border-t border-ink-100 pt-2 text-[12px] text-ink-400">
              Em média, 100 mensagens custam {formatBrl(model.perMessageBrl * 100)}. Mensagens por voz somam mais{' '}
              {formatBrl(model.perVoiceMinuteBrl)} por minuto de áudio.
            </p>
          </dl>
        </Card>

        <Card>
          <CardHeader title="E se trocar o modelo de IA?" />
          <p className="mb-3 mt-1 text-[12px] text-ink-400">Custo de IA por mês e por loja, no mesmo uso de hoje.</p>
          <PairBars
            aLabel={AI_MODEL_PRESETS.luna.label}
            bLabel={AI_MODEL_PRESETS.sol.label}
            bColor="bg-danger"
            height={120}
            data={PAID_PLAN_IDS.map((id) => ({
              label: PLAN_LABELS[id],
              a: luna.plans[id].aiChat + luna.plans[id].aiVoice,
              b: sol.plans[id].aiChat + sol.plans[id].aiVoice,
            }))}
          />
          <p className="mt-3 text-[12px] text-ink-400">
            Resultado do mês: {formatBrl(luna.profit)} no modelo atual contra {formatBrl(sol.profit)} no maior.
          </p>
        </Card>
      </div>

      {/* 7 — Premissas, só leitura */}
      <details className="group rounded-2xl border border-ink-100 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[14px] font-semibold text-ink-900">
          <span className="flex items-center gap-2">
            Como o sistema calcula <Badge>somente leitura</Badge>
          </span>
          <span className="text-ink-400 transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="flex flex-col gap-5 border-t border-ink-100 px-5 py-5">
          <ul className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
            {[
              ['Modelo de IA', aiQuery.data ? aiQuery.data.model.name : '—', 'OpenAI'],
              ['Preço da IA (por 1 milhão de tokens)', `US$ ${real.inputs.ai.priceIn.toLocaleString('pt-BR')} entrada · US$ ${real.inputs.ai.priceOut.toLocaleString('pt-BR')} saída`, 'tabela oficial da OpenAI'],
              ['Tokens por mensagem', real.inputs.ai.realAverage ? `${formatInt(real.inputs.ai.realAverage.in)} entrada · ${formatInt(real.inputs.ai.realAverage.out)} saída` : 'mix padrão de mensagens', real.aiSource === 'medido' ? 'medido no sistema' : 'estimativa'],
              ['Mensagens por voz', formatPct(real.inputs.ai.voiceShare * 100, 0), real.aiSource === 'medido' ? 'medido no sistema' : 'estimativa'],
              ['Transcrição de voz', `US$ ${real.inputs.ai.transcribePerMin.toLocaleString('pt-BR')} por minuto`, 'tabela oficial da OpenAI'],
              ['Comissão da Stripe', `${formatPct(real.inputs.channels.stripe.pct, 2)} + ${formatBrl(real.inputs.channels.stripe.fixedBrl)} por cobrança`, 'tarifa da Stripe Brasil (confirme no seu painel)'],
              ['Comissão da Apple e do Google Play', `${formatPct(real.inputs.channels.apple.pct, 0)} sobre a mensalidade`, 'programas de pequenos desenvolvedores (Apple exige inscrição)'],
              ['Imposto do MEI (DAS)', `${formatBrl(real.inputs.mei.monthlyBrl)} por mês, fixo`, 'INSS R$ 81,05 + ISS R$ 5,00 em 2026 (serviços)'],
              ['Cotação do dólar', formatBrl(real.inputs.fx), 'referência fixa do relatório'],
              ['Conta Apple Developer', `US$ ${real.inputs.infra.appleUsdPerYear} por ano`, 'tarifa da Apple'],
              ['Visitas à vitrine por loja', 'estimativa por plano', 'o app ainda não mede'],
            ].map(([label, value, source]) => (
              <li key={label} className="flex flex-col border-b border-ink-100 pb-2">
                <span className="text-ink-500">{label}</span>
                <span className="font-medium text-ink-900">{value}</span>
                <span className="text-[11px] text-ink-400">{source}</span>
              </li>
            ))}
          </ul>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-900">O que cada plano inclui (definido no código)</p>
            <Table head={['Plano', 'Produtos', 'Produto próprio e kits', 'Categorias', 'Promoções', 'Cota de IA/mês']}>
              {planLimits.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-3 py-2.5 font-medium text-ink-900">{plan.name}</td>
                  <td className="px-3 py-2.5 text-ink-800">{plan.maxProducts === null ? 'ilimitado' : formatInt(plan.maxProducts)}</td>
                  <td className="px-3 py-2.5">{plan.manualProductsEnabled ? <Badge tone="good">sim</Badge> : <Badge>não</Badge>}</td>
                  <td className="px-3 py-2.5">{plan.categoriesEnabled ? <Badge tone="good">sim</Badge> : <Badge>não</Badge>}</td>
                  <td className="px-3 py-2.5">{plan.promotionsEnabled ? <Badge tone="good">sim</Badge> : <Badge>não</Badge>}</td>
                  <td className="px-3 py-2.5 text-ink-800">{formatInt(plan.aiMessagesPerMonth)}</td>
                </tr>
              ))}
            </Table>
          </div>
        </div>
      </details>
    </div>
  );
}
