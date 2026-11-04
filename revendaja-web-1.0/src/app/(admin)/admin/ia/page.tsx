'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminAi, type AiTotals } from '@/lib/api/admin';
import { getErrorMessage } from '@/lib/api/errors';
import { useCostInputs } from '@/lib/admin/hooks';
import { averageMessageCostUsd, type CostInputs } from '@/lib/admin/costModel';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';
import {
  Bars,
  BarLabels,
  Kpi,
  Meter,
  PageHeader,
  PlanBadge,
  QueryState,
  Table,
  formatBrl,
  formatCompact,
  formatInt,
  formatPeriod,
} from '@/components/admin/ui';

// Custo em R$ de um conjunto de tokens e transcrições, com os preços do simulador.
function costBrl(totals: Pick<AiTotals, 'inputTokens' | 'outputTokens' | 'transcriptions'>, inputs: CostInputs) {
  const { ai, fx } = inputs;
  const rate = (1 - ai.cachedShare) * ai.priceIn + ai.cachedShare * ai.priceCached;
  const chat = (totals.inputTokens / 1e6) * rate + (totals.outputTokens / 1e6) * ai.priceOut;
  const voice = totals.transcriptions * ((ai.voiceSeconds / 60) * ai.transcribePerMin);
  return (chat + voice) * fx;
}

export default function AdminAiPage() {
  const { inputs, loaded } = useCostInputs();
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const query = useQuery({ queryKey: ['admin', 'ai', period ?? 'current'], queryFn: () => getAdminAi(period) });
  const data = query.data;

  if (!data || !loaded) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Assistente de IA" subtitle="Quanto o assistente é usado e quanto custa." />
        <QueryState loading={query.isLoading || !loaded} error={query.error ? getErrorMessage(query.error) : null} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const cost = costBrl(data.totals, inputs);
  const perMessage = data.totals.messages > 0 ? cost / data.totals.messages : null;
  const avgInput = data.totals.messages > 0 ? Math.round(data.totals.inputTokens / data.totals.messages) : null;
  const avgOutput = data.totals.messages > 0 ? Math.round(data.totals.outputTokens / data.totals.messages) : null;
  const expectedPerMessage = averageMessageCostUsd(inputs.ai) * inputs.fx;
  const history = [...data.history].reverse();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Assistente de IA"
        subtitle={`Modelo ${data.model.name} · raciocínio "${data.model.reasoningEffort}". Custos usam os preços do simulador.`}
        right={
          <select
            aria-label="Mês"
            value={period ?? data.period}
            onChange={(event) => setPeriod(event.target.value)}
            className="h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] text-ink-800 outline-none focus:border-primary-500"
          >
            {[...new Set([data.period, ...data.history.map((item) => item.period)])].map((key) => (
              <option key={key} value={key}>
                {formatPeriod(key)}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Mensagens" value={formatInt(data.totals.messages)} hint={`${formatInt(data.totals.transcriptions)} por voz`} />
        <Kpi
          label="Tokens"
          value={`${formatCompact(data.totals.inputTokens)} / ${formatCompact(data.totals.outputTokens)}`}
          hint="entrada / saída"
        />
        <Kpi label="Custo no mês" value={formatBrl(cost)} hint={`${formatInt(data.totals.storesUsing)} loja(s) usando`} />
        <Kpi
          label="Custo por mensagem"
          value={perMessage === null ? '—' : formatBrl(perMessage, 4)}
          hint={`esperado no simulador: ${formatBrl(expectedPerMessage, 4)}`}
          tone={perMessage !== null && perMessage > expectedPerMessage * 1.5 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mensagens por mês" />
          <div className="mt-4">
            <Bars data={history.map((item) => ({ label: formatPeriod(item.period), value: item.messages }))} />
            <BarLabels labels={history.map((item) => formatPeriod(item.period))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Média por mensagem (medida)" />
          <dl className="mt-4 flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-600">Tokens de entrada</dt>
              <dd className="font-semibold text-ink-900">{avgInput === null ? '—' : formatInt(avgInput)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Tokens de saída</dt>
              <dd className="font-semibold text-ink-900">{avgOutput === null ? '—' : formatInt(avgOutput)}</dd>
            </div>
            <p className="border-t border-ink-100 pt-2 text-[12px] text-ink-400">
              No simulador (Custos e planos) há o botão “Usar a média real”, que aplica estes números a todas as projeções.
            </p>
          </dl>
        </Card>
      </div>

      <Card className="p-0">
        <div className="px-5 pt-5">
          <CardHeader title={`Quem mais usa · ${formatPeriod(data.period)}`} />
        </div>
        <div className="mt-3">
          <Table head={['Loja', 'Plano', 'Mensagens / cota', 'Voz', 'Tokens (ent. / saída)', 'Custo']}>
            {data.byStore.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-ink-400">
                  Ninguém usou o assistente neste mês.
                </td>
              </tr>
            )}
            {data.byStore.map((row) => (
              <tr key={row.storeId}>
                <td className="px-3 py-2.5 font-medium text-ink-900">{row.storeName}</td>
                <td className="px-3 py-2.5">
                  <PlanBadge plan={row.plan} />
                </td>
                <td className="w-56 px-3 py-2.5">
                  <div className="flex items-center justify-between text-[12px] text-ink-600">
                    <span>
                      {formatInt(row.messages)} / {formatInt(row.quota)}
                    </span>
                    <span>{row.quotaUsedPercent}%</span>
                  </div>
                  <div className="mt-1">
                    <Meter value={row.messages} max={row.quota} tone={row.quotaUsedPercent >= 100 ? 'bad' : row.quotaUsedPercent >= 80 ? 'warn' : 'neutral'} />
                  </div>
                </td>
                <td className="px-3 py-2.5 text-ink-800">{formatInt(row.transcriptions)}</td>
                <td className="px-3 py-2.5 text-ink-800">
                  {formatCompact(row.inputTokens)} / {formatCompact(row.outputTokens)}
                </td>
                <td className="px-3 py-2.5 font-medium text-ink-900">{formatBrl(costBrl(row, inputs))}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
    </div>
  );
}
