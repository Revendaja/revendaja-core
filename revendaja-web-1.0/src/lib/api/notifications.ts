import { request } from './http';
import { buildQuery } from '../utils/dates';
import type { AppNotification, Paginated } from './types';

export const NOTIFICATIONS_PAGE_SIZE = 20;

// Mais recentes primeiro.
export function listNotifications(page = 1, pageSize = NOTIFICATIONS_PAGE_SIZE) {
  return request<Paginated<AppNotification>>(`/notifications${buildQuery({ page, pageSize })}`, { auth: true });
}

// Quantas notificações ainda não foram lidas (badge do sino).
export function getUnreadNotificationsCount() {
  return request<{ count: number }>('/notifications/unread-count', { auth: true });
}

export function markNotificationRead(id: string) {
  return request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH', auth: true });
}

export function markAllNotificationsRead() {
  return request<{ updated: number }>('/notifications/read-all', { method: 'PATCH', auth: true });
}

// Resposta sem corpo (204). 404 se a notificação não existir ou não for da usuária autenticada.
export function deleteNotification(id: string) {
  return request<null>(`/notifications/${id}`, { method: 'DELETE', auth: true });
}
