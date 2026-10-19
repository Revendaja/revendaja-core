'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  NOTIFICATIONS_PAGE_SIZE,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage } from '@/lib/api/errors';
import type { AppNotification, NotificationType, Paginated } from '@/lib/api/types';
import { formatRelativeTime } from '@/lib/utils/format';
import { Icon, type IconName } from '@/components/dashboard/icons';

type NotificationsCache = InfiniteData<Paginated<AppNotification>, number>;
type Filter = 'all' | 'unread';

const TYPE_META: Record<NotificationType, { icon: IconName; tile: string }> = {
  SYSTEM: { icon: 'bell', tile: 'bg-primary-50 text-primary-500' },
  STOCK_LOW: { icon: 'box', tile: 'bg-danger-soft text-danger' },
  GOAL: { icon: 'flag', tile: 'bg-success-soft text-success' },
  PROMOTION: { icon: 'sparkle', tile: 'bg-warning-soft text-warning' },
};

// Para onde cada ação do payload leva no painel web.
const ACTION_ROUTES: Record<string, string> = {
  OPEN_STOCK: '/produtos',
  OPEN_HOME: '/dashboard',
  OPEN_SUBSCRIPTION: '/assinatura',
};

// Duração da animação de saída de um item; o item só sai de verdade do cache depois dela.
const LEAVE_MS = 320;

function dayLabel(iso: string, now: Date) {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays <= 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return 'Anteriores';
}

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  // Itens que estão animando a saída (já "sumiram" para quem olha, antes do backend responder).
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [now] = useState(() => new Date());

  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications(),
    queryFn: ({ pageParam }) => listNotifications(pageParam, NOTIFICATIONS_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });

  // Em "Não lidas" as não lidas podem estar nas páginas seguintes: carrega até acabar.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (filter === 'unread' && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [filter, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // --- Atualizações otimistas: a tela responde na hora e o backend confirma depois. ---------------

  function patchList(patch: (items: AppNotification[]) => AppNotification[], totalDelta = 0) {
    queryClient.setQueryData<NotificationsCache>(queryKeys.notifications(), (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: patch(page.items),
              total: Math.max(page.total + totalDelta, 0),
            })),
          }
        : current,
    );
  }

  function patchUnreadCount(delta: number | 'zero') {
    queryClient.setQueryData<{ count: number }>(queryKeys.unreadNotifications(), (current) =>
      current ? { count: delta === 'zero' ? 0 : Math.max(current.count + delta, 0) } : current,
    );
  }

  function animateOut(ids: string[], then: () => void) {
    setLeaving((previous) => new Set([...previous, ...ids]));
    window.setTimeout(() => {
      then();
      setLeaving((previous) => {
        const next = new Set(previous);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, LEAVE_MS);
  }

  // Se o backend recusar, recarrega do servidor: o item volta e o erro aparece.
  const rollback = (error: unknown) => {
    setActionError(getErrorMessage(error));
    void queryClient.invalidateQueries({ queryKey: queryKeys.allNotifications() });
  };

  const readMutation = useMutation({ mutationFn: markNotificationRead, onError: rollback });
  const readAllMutation = useMutation({ mutationFn: markAllNotificationsRead, onError: rollback });
  const deleteMutation = useMutation({ mutationFn: deleteNotification, onError: rollback });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadItems = items.filter((item) => !item.isRead);
  const visible = items.filter((item) => filter === 'all' || !item.isRead || leaving.has(item.id));

  function markRead(item: AppNotification) {
    if (item.isRead) return;
    patchList((list) => list.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
    patchUnreadCount(-1);
    if (filter === 'unread') animateOut([item.id], () => undefined);
    readMutation.mutate(item.id);
  }

  function open(item: AppNotification) {
    setActionError(null);
    markRead(item);
    const action = item.data?.action;
    const route = typeof action === 'string' ? ACTION_ROUTES[action] : undefined;
    if (route) router.push(route);
  }

  function remove(item: AppNotification) {
    setActionError(null);
    if (!item.isRead) patchUnreadCount(-1);
    animateOut([item.id], () => patchList((list) => list.filter((entry) => entry.id !== item.id), -1));
    deleteMutation.mutate(item.id);
  }

  function readAll() {
    setActionError(null);
    const ids = unreadItems.map((item) => item.id);
    patchList((list) => list.map((entry) => ({ ...entry, isRead: true })));
    patchUnreadCount('zero');
    if (filter === 'unread') animateOut(ids, () => undefined);
    readAllMutation.mutate();
  }

  // Agrupa por dia, mantendo a ordem (mais recentes primeiro).
  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const item of visible) {
    const label = dayLabel(item.createdAt, now);
    const group = groups.find((entry) => entry.label === label);
    if (group) group.items.push(item);
    else groups.push({ label, items: [item] });
  }

  const loadingMore = filter === 'unread' && (hasNextPage || isFetchingNextPage);
  let rowIndex = 0;

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <Icon name="bell" size={20} />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-ink-900">Notificações</h1>
            <p className="text-xs text-ink-400">
              {unreadItems.length > 0
                ? `${unreadItems.length} ${unreadItems.length === 1 ? 'não lida' : 'não lidas'}`
                : 'Você está em dia'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-ink-100 bg-ink-50/70 p-0.5 text-xs">
            {(
              [
                ['all', 'Todas'],
                ['unread', 'Não lidas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-md px-3 py-1.5 transition-all duration-200 ${
                  filter === value
                    ? 'bg-white font-medium text-ink-900 shadow-sm ring-1 ring-ink-100'
                    : 'text-ink-400 hover:text-ink-600'
                }`}
              >
                {label}
                {value === 'unread' && unreadItems.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary-500 px-1.5 py-px text-[10px] font-semibold text-white">
                    {unreadItems.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={readAll}
            disabled={unreadItems.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="check" size={14} />
            Marcar todas como lidas
          </button>
        </div>
      </div>

      {actionError && (
        <p className="animate-fade-up mb-4 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {actionError}
        </p>
      )}

      {query.isPending && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-[84px] animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-2xl border border-ink-100 p-10 text-center">
          <p className="mb-3 text-sm font-medium text-danger">{getErrorMessage(query.error)}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {query.data && visible.length === 0 && !loadingMore && (
        <div className="animate-fade-up flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-50 text-ink-400">
            <Icon name="bell" size={24} />
          </span>
          <p className="mt-4 text-sm font-semibold text-ink-900">
            {filter === 'unread' ? 'Tudo lido por aqui' : 'Nenhuma notificação por aqui'}
          </p>
          <p className="mt-1 max-w-xs text-xs text-ink-400">
            Os avisos de estoque, metas e novidades da sua loja aparecem aqui.
          </p>
          {filter === 'unread' && items.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
            >
              Ver todas
            </button>
          )}
        </div>
      )}

      {/* `key` por filtro: ao trocar de aba a lista reaparece com a animação de entrada. */}
      <div key={filter} className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {group.label}
            </h2>
            <ul>
              {group.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  leaving={leaving.has(item.id)}
                  delay={Math.min(rowIndex++, 8) * 35}
                  onOpen={() => open(item)}
                  onDelete={() => remove(item)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {loadingMore && visible.length === 0 && (
        <p className="py-10 text-center text-xs text-ink-400">Procurando notificações não lidas...</p>
      )}

      {filter === 'all' && hasNextPage && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-ink-200 px-4 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
          >
            {isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
          </button>
        </div>
      )}
    </div>
  );
}

// O item colapsa (altura, opacidade e deslize) ao sair; o espaçamento fica DENTRO do trecho que
// colapsa, senão sobraria um "buraco" entre os cartões.
function NotificationRow({
  item,
  leaving,
  delay,
  onOpen,
  onDelete,
}: {
  item: AppNotification;
  leaving: boolean;
  delay: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[item.type] ?? TYPE_META.SYSTEM;

  return (
    <li
      className={`grid transition-all duration-300 ease-out ${
        leaving ? 'grid-rows-[0fr] -translate-x-3 opacity-0' : 'grid-rows-[1fr] translate-x-0 opacity-100'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="animate-fade-up pb-2" style={{ animationDelay: `${delay}ms` }}>
          <div
            className={`group relative flex items-start gap-3 rounded-2xl border p-4 transition-colors duration-500 hover:border-ink-200 ${
              item.isRead ? 'border-ink-100 bg-white' : 'border-primary-200 bg-primary-50/50'
            }`}
          >
            <button
              type="button"
              onClick={onOpen}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              aria-label={`Abrir notificação: ${item.title}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tile}`}>
                <Icon name={meta.icon} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={`truncate text-sm transition-all duration-500 ${
                      item.isRead ? 'font-medium text-ink-800' : 'font-semibold text-ink-900'
                    }`}
                  >
                    {item.title}
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full bg-primary-500 transition-all duration-500 ${
                      item.isRead ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
                    }`}
                  />
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-ink-500">{item.message}</span>
                <span className="mt-1.5 block text-[11px] text-ink-400">{formatRelativeTime(item.createdAt)}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onDelete}
              aria-label={`Excluir notificação: ${item.title}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-300 transition hover:bg-danger-soft hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
