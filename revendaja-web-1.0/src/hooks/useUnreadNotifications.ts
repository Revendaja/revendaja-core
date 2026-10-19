import { useQuery } from '@tanstack/react-query';
import { getUnreadNotificationsCount } from '@/lib/api/notifications';
import { queryKeys } from '@/lib/api/queryKeys';

// Contagem de notificações não lidas, atualizada a cada minuto. Compartilhada pela top bar e pela
// sidebar (mesma query, uma chamada só).
export function useUnreadNotifications() {
  const query = useQuery({
    queryKey: queryKeys.unreadNotifications(),
    queryFn: getUnreadNotificationsCount,
    refetchInterval: 60_000,
  });
  return query.data?.count ?? 0;
}
