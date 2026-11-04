'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdminSystem } from '@/lib/api/admin';
import { getErrorMessage } from '@/lib/api/errors';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';
import { Badge, PageHeader, QueryState, formatInt, formatUptime } from '@/components/admin/ui';

const QUEUE_LABELS: Record<string, string> = {
  waiting: 'Na espera',
  active: 'Em execução',
  delayed: 'Agendados',
  failed: 'Com falha',
  completed: 'Concluídos',
};

export default function AdminSystemPage() {
  const query = useQuery({ queryKey: ['admin', 'system'], queryFn: getAdminSystem, refetchInterval: 30_000 });
  const data = query.data;

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Sistema" subtitle="Se tudo o que o app usa está ligado e funcionando." />
        <QueryState loading={query.isLoading} error={query.error ? getErrorMessage(query.error) : null} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const failing = data.integrations.filter((item) => !item.ok && item.detail !== 'opcional');
  const failedJobs = data.queue?.failed ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Sistema"
        subtitle="Se tudo o que o app usa está ligado e funcionando. Mostra só se cada serviço está configurado, nunca as chaves."
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

      {failing.length === 0 && failedJobs === 0 ? (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-[13px] text-success">Tudo configurado e respondendo.</p>
      ) : (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">
          {failing.length > 0 && `${failing.length} serviço(s) com problema: ${failing.map((item) => item.label).join(', ')}. `}
          {failedJobs > 0 && `${failedJobs} tarefa(s) da fila com falha.`}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Serviços e integrações" />
          <ul className="mt-3 divide-y divide-ink-100">
            {data.integrations.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{item.label}</p>
                  {item.detail && <p className="truncate text-[12px] text-ink-400">{item.detail}</p>}
                </div>
                <Badge tone={item.ok ? 'good' : item.detail === 'opcional' ? 'neutral' : 'bad'}>
                  {item.ok ? 'ok' : item.detail === 'opcional' ? 'desligado' : 'com problema'}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card>
            <CardHeader title="Execução" />
            <dl className="mt-3 flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink-600">Ambiente</dt>
                <dd className="font-semibold text-ink-900">{data.runtime.environment}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Servidor ligado há</dt>
                <dd className="font-semibold text-ink-900">{formatUptime(data.runtime.uptimeSeconds)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Memória em uso</dt>
                <dd className="font-semibold text-ink-900">{formatInt(data.runtime.memoryMb)} MB</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Node</dt>
                <dd className="font-semibold text-ink-900">{data.runtime.node}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Domínio das vitrines</dt>
                <dd className="font-semibold text-ink-900">{data.runtime.storeBaseDomain}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Migrations aplicadas</dt>
                <dd className="font-semibold text-ink-900">{data.migrations ? formatInt(data.migrations.applied) : '—'}</dd>
              </div>
              {data.migrations?.latest && <p className="text-[11px] text-ink-400">Última: {data.migrations.latest}</p>}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Fila de notificações" />
            {data.queue ? (
              <dl className="mt-3 flex flex-col gap-2 text-[13px]">
                {Object.entries(data.queue).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <dt className="text-ink-600">{QUEUE_LABELS[key] ?? key}</dt>
                    <dd className={`font-semibold ${key === 'failed' && value > 0 ? 'text-danger' : 'text-ink-900'}`}>{formatInt(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-[13px] text-danger">Sem resposta do Redis.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Assistente de IA" />
            <dl className="mt-3 flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink-600">Modelo</dt>
                <dd className="font-semibold text-ink-900">{data.ai.model}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Raciocínio</dt>
                <dd className="font-semibold text-ink-900">{data.ai.reasoningEffort}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-600">Transcrição de voz</dt>
                <dd className="font-semibold text-ink-900">{data.ai.transcribeModel}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
