import { request } from './http';
import { buildQuery } from './query';
import type { AppNotification, Paginated } from './types';

export const NOTIFICATIONS_PAGE_SIZE = 20;

// Mais recentes primeiro.
export function listNotifications(page = 1, pageSize = NOTIFICATIONS_PAGE_SIZE) {
  return request<Paginated<AppNotification>>(`/notifications${buildQuery({ page, pageSize })}`, {
    auth: true,
  });
}

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

export function registerDeviceToken(input: { token: string; platform?: 'ios' | 'android' }) {
  return request<{ registered: true }>('/notifications/device-tokens', {
    method: 'POST',
    body: input,
    auth: true,
  });
}

// Resposta sem corpo (204).
export function unregisterDeviceToken(token: string) {
  return request<null>(`/notifications/device-tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    auth: true,
  });
}
