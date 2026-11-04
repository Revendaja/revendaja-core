'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdminLatency } from '@/lib/api/admin';
import { getErrorMessage } from '@/lib/api/errors';
import { classifyLatency, errorRatePercent, formatMs, isSlowByDesign } from '@/lib/admin/latency';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';
import {
  Badge,
  Kpi,
  Meter,
  PageHeader,
  QueryState,
  Table,
  formatInt,
  formatPct,
  formatUptime,
} from '@/components/admin/ui';

export default function AdminPerformancePage() {
  const query = useQuery({ queryKey: ['admin', 'latency'], queryFn: getAdminLatency, refetchInterval: 15_000 });
  const data = query.data;

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Desempenho" subtitle="Quão rápida a API responde, rota por rota." />
        <QueryState loading={query.isLoading} error={query.error ? getErrorMessage(query.error) : null} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const slowest = data.routes[0];
  const slowestLevel = slowest ? classifyLatency(slowest.route, slowest.p95Ms) : null;
  const errorRate = errorRatePercent(data.serverErrors, data.requests);
  const maxP95 = Math.max(1, ...data.routes.map((route) => route.p95Ms));
  const attention = data.routes.filter((route) => classifyLatency(route.route, route.p95Ms).tone !== 'good');
  const failing = data.routes.filter((route) => route.serverErrors > 0);

  const dbTone = data.db.medianMs === null ? 'bad' : data.db.medianMs < 100 ? 'good' : data.db.medianMs < 300 ? 'warn' : 'bad';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Desempenho"
        subtitle={`Quão rápida a API responde, rota por rota, nos últimos ${data.windowMinutes} minutos. Atualiza sozinho a cada 15 segundos.`}
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

      {data.routes.length === 0 ? (
        <p className="rounded-xl bg-ink-50 px-3 py-2 text-[13px] text-ink-600">
          Ainda não há pedidos medidos. A medição começa quando o servidor liga (ele está no ar há {formatUptime(data.uptimeSeconds)}) e
          recomeça do zero a cada deploy.
        </p>
      ) : attention.length === 0 && failing.length === 0 ? (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-[13px] text-success">Todas as rotas estão respondendo rápido e sem falhas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {failing.length > 0 && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {failing.length} rota(s) com falha do servidor (erro 5xx): {failing.map((route) => route.route).join(', ')}.
            </p>
          )}
          {attention.length > 0 && (
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">
              {attention.length} rota(s) mais lentas que o ideal: {attention.map((route) => route.route).join(', ')}.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pedidos medidos" value={formatInt(data.requests)} hint={`na última hora, ${data.routes.length} rota(s)`} />
        <Kpi
          label="Falhas do servidor"
          value={formatPct(errorRate, 2)}
          tone={errorRate === null ? 'neutral' : errorRate >= 1 ? 'bad' : errorRate > 0 ? 'warn' : 'good'}
          hint={`${formatInt(data.serverErrors)} resposta(s) com erro 5xx`}
        />
        <Kpi
          label="Rota mais lenta (p95)"
          value={slowest ? formatMs(slowest.p95Ms) : '—'}
          tone={slowestLevel?.tone ?? 'neutral'}
          hint={slowest ? `${slowest.method} ${slowest.route}` : 'sem pedidos ainda'}
        />
        <Kpi
          label="Banco de dados"
          value={data.db.medianMs === null ? 'sem resposta' : formatMs(data.db.medianMs)}
          tone={dbTone}
          hint="tempo de uma consulta simples (mediana de 3)"
        />
      </div>

      <Card className="p-0">
        <div className="px-5 pt-5">
          <CardHeader title="Rota por rota" />
          <p className="mt-1 text-[12px] text-ink-400">Da mais lenta para a mais rápida. A barra compara o p95 de cada rota.</p>
        </div>
        <div className="mt-3">
          <Table head={['Rota', 'Pedidos', 'Falhas', 'p50', 'p95', 'p99', 'Pior', 'Situação']}>
            {data.routes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-ink-400">
                  Sem pedidos medidos ainda.
                </td>
              </tr>
            )}
            {data.routes.map((route) => {
              const level = classifyLatency(route.route, route.p95Ms);
              return (
                <tr key={`${route.method} ${route.route}`} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-ink-900">
                      <span className="mr-1.5 text-[11px] font-semibold text-ink-400">{route.method}</span>
                      {route.route}
                    </p>
                    {isSlowByDesign(route.route) && <p className="text-[11px] text-ink-400">chama a OpenAI: leva segundos por natureza</p>}
                    <div className="mt-1.5 w-48">
                      <Meter value={route.p95Ms} max={maxP95} tone={level.tone === 'good' ? 'good' : level.tone === 'warn' ? 'warn' : 'bad'} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-800">{formatInt(route.count)}</td>
                  <td className="px-3 py-2.5">
                    {route.serverErrors > 0 ? <Badge tone="bad">{formatInt(route.serverErrors)} erro(s) 5xx</Badge> : <span className="text-ink-400">0</span>}
                    {route.clientErrors > 0 && <p className="mt-0.5 text-[11px] text-ink-400">{formatInt(route.clientErrors)} recusa(s) 4xx</p>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-800">{formatMs(route.p50Ms)}</td>
                  <td className="px-3 py-2.5 font-medium text-ink-900">{formatMs(route.p95Ms)}</td>
                  <td className="px-3 py-2.5 text-ink-800">{formatMs(route.p99Ms)}</td>
                  <td className="px-3 py-2.5 text-ink-500">{formatMs(route.maxMs)}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={level.tone}>{level.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Como ler estes números" />
        <ul className="mt-3 grid gap-2 text-[13px] text-ink-600 md:grid-cols-2">
          <li>
            <b className="text-ink-900">p50</b>: metade das chamadas foi mais rápida que isso. É o tempo “normal”.
          </li>
          <li>
            <b className="text-ink-900">p95</b>: 95% das chamadas foram mais rápidas. É o que quase todo mundo sente, e o que o painel usa para avaliar.
          </li>
          <li>
            <b className="text-ink-900">p99</b>: só 1 em cada 100 chamadas foi mais lenta. Mostra os piores momentos.
          </li>
          <li>
            <b className="text-ink-900">Situação</b>: verde abaixo de 300 ms, amarelo até 1 s, vermelho acima disso. Para as rotas do assistente de IA os limites são 8 s e 20 s.
          </li>
        </ul>
        <p className="mt-3 text-[12px] text-ink-400">
          Esta medição fica na memória do servidor: some quando ele reinicia (a cada deploy) e, com mais de uma máquina, mostra só a que
          respondeu. Para histórico de dias e alertas automáticos, o próximo passo é enviar as métricas para uma ferramenta própria (Grafana,
          Datadog ou similar).
        </p>
      </Card>
    </div>
  );
}
