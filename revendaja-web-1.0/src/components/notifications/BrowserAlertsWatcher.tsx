'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getUnreadNotificationsCount, listNotifications } from '@/lib/api/notifications';
import { queryKeys } from '@/lib/api/queryKeys';
import { useBrowserAlerts } from '@/lib/notifications/browserAlerts';

// Montado uma vez no painel. Quando a contagem de não lidas SOBE (chegou notificação nova), mostra
// um alerta do navegador com a mais recente — mesmo com a aba em segundo plano. Não renderiza nada.
export function BrowserAlertsWatcher() {
  const router = useRouter();
  const { enabled } = useBrowserAlerts();
  // Mesma query da sidebar/topbar (deduplicada); aqui também consulta com a aba em segundo plano.
  const countQuery = useQuery({
    queryKey: queryKeys.unreadNotifications(),
    queryFn: getUnreadNotificationsCount,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
  const count = countQuery.data?.count;
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (count === undefined) return;
    const last = previous.current;
    previous.current = count;
    // A primeira leitura só define a linha de base: não alerta sobre o que já estava pendente.
    if (last === null || count <= last || !enabled) return;

    let cancelled = false;
    void listNotifications(1, 1)
      .then((page) => {
        const latest = page.items[0];
        if (cancelled || !latest || latest.isRead) return;
        const alert = new Notification(latest.title, { body: latest.message, tag: latest.id });
        alert.onclick = () => {
          window.focus();
          router.push('/notificacoes');
          alert.close();
        };
      })
      .catch(() => {
        // Alerta é só um extra: se falhar, a notificação continua na caixa de entrada.
      });
    return () => {
      cancelled = true;
    };
  }, [count, enabled, router]);

  return null;
}
