'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getUnreadNotificationsCount } from '@/lib/api/notifications';
import { queryKeys } from '@/lib/api/queryKeys';
import { disableBrowserAlerts, enableBrowserAlerts, useBrowserAlerts } from '@/lib/notifications/browserAlerts';
import { Icon, type IconName } from '@/components/dashboard/icons';
import { Banner, PageHeader, ToggleRow } from '@/components/products/FormParts';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';

// Os mesmos tipos que a API envia (ver TYPE_META na caixa de notificações).
const KINDS: { icon: IconName; tile: string; title: string; description: string }[] = [
  { icon: 'box', tile: 'bg-danger-soft text-danger', title: 'Estoque baixo', description: 'Quando um produto chega ao estoque mínimo.' },
  { icon: 'flag', tile: 'bg-success-soft text-success', title: 'Metas', description: 'Quando você bate ou se aproxima da meta do mês.' },
  { icon: 'sparkle', tile: 'bg-warning-soft text-warning', title: 'Promoções', description: 'Novidades e ofertas para a sua revenda.' },
  { icon: 'bell', tile: 'bg-primary-50 text-primary-500', title: 'Avisos do Revendajá', description: 'Comunicados importantes sobre a sua conta.' },
];

export default function NotificationSettingsPage() {
  const { supported, permission, enabled } = useBrowserAlerts();
  const unreadQuery = useQuery({ queryKey: queryKeys.unreadNotifications(), queryFn: getUnreadNotificationsCount });
  const unread = unreadQuery.data?.count ?? 0;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleToggle(value: boolean) {
    setNotice(null);
    if (!value) {
      disableBrowserAlerts();
      return;
    }
    setBusy(true);
    try {
      const result = await enableBrowserAlerts();
      if (result === 'denied') {
        setNotice('O navegador bloqueou os alertas. Libere as notificações deste site nas permissões do navegador e tente de novo.');
      }
    } finally {
      setBusy(false);
    }
  }

  const description = !supported
    ? 'Este navegador não suporta alertas.'
    : permission === 'denied'
      ? 'Bloqueado nas permissões do navegador. Libere para ativar.'
      : 'Receba um aviso do navegador quando chegar uma notificação nova, mesmo com a aba em segundo plano.';

  return (
    <div className="w-full pb-16">
      <PageHeader title="Notificações" subtitle="Como você quer ser avisado" backHref="/dashboard" />

      {notice && <Banner type="info" message={notice} />}

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Alertas no navegador" />
          <div className="mt-4">
            <ToggleRow
              title="Avisar neste navegador"
              description={description}
              checked={enabled}
              onChange={(value) => void handleToggle(value)}
              disabled={!supported || busy || permission === 'denied'}
            />
          </div>
          <p className="mt-4 border-t border-ink-100 pt-4 text-xs text-ink-400">
            Vale só para este navegador e funciona com o painel aberto em alguma aba. No celular, as notificações
            push são ativadas no app, em Mais → Notificações push.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="O que você recebe"
            right={
              <Link href="/notificacoes" className="text-xs font-semibold text-primary-600 hover:underline">
                {unread > 0 ? `Ver caixa de entrada (${unread > 99 ? '99+' : unread})` : 'Ver caixa de entrada'}
              </Link>
            }
          />
          <ul className="mt-3 divide-y divide-ink-100">
            {KINDS.map((kind) => (
              <li key={kind.title} className="flex items-center gap-3 py-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kind.tile}`}>
                  <Icon name={kind.icon} size={18} />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-ink-900">{kind.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{kind.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
