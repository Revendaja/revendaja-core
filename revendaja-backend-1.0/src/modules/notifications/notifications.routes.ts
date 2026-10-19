import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireAdmin } from '../../shared/middlewares/requireAdmin';
import {
  deviceTokenParamsSchema,
  listNotificationsQuerySchema,
  markAllReadResponseSchema,
  notificationParamsSchema,
  notificationResponseSchema,
  notifyAllSchema,
  notifyPlanSchema,
  notifyUserParamsSchema,
  notifyUserSchema,
  paginatedNotificationsResponseSchema,
  queuedResponseSchema,
  registerDeviceTokenResponseSchema,
  registerDeviceTokenSchema,
  unreadCountResponseSchema,
} from './notifications.schema';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyAll,
  notifyPlan,
  notifyUser,
  registerDeviceToken,
  removeNotification,
  runStockCheckJob,
  unregisterDeviceToken,
} from './notifications.controller';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // --- Admin: disparo manual --------------------------------------------------

  server.post(
    '/notifications/admin/all',
    {
      preHandler: [authenticate, requireAdmin],
      schema: {
        tags: ['notifications'],
        summary: 'Cria uma notificação para todos os usuários. Assíncrono: só enfileira o envio.',
        security: [{ bearerAuth: [] }],
        body: notifyAllSchema,
        response: { 202: queuedResponseSchema },
      },
    },
    notifyAll,
  );

  server.post(
    '/notifications/admin/plan',
    {
      preHandler: [authenticate, requireAdmin],
      schema: {
        tags: ['notifications'],
        summary:
          'Cria uma notificação para as usuárias de um plano específico. Assíncrono: só enfileira o envio.',
        security: [{ bearerAuth: [] }],
        body: notifyPlanSchema,
        response: { 202: queuedResponseSchema },
      },
    },
    notifyPlan,
  );

  server.post(
    '/notifications/admin/user/:userId',
    {
      preHandler: [authenticate, requireAdmin],
      schema: {
        tags: ['notifications'],
        summary: 'Cria uma notificação para uma usuária específica (404 se o userId não existir).',
        security: [{ bearerAuth: [] }],
        params: notifyUserParamsSchema,
        body: notifyUserSchema,
        response: { 201: notificationResponseSchema },
      },
    },
    notifyUser,
  );

  server.post(
    '/notifications/admin/stock-check',
    {
      preHandler: [authenticate, requireAdmin],
      schema: {
        tags: ['notifications'],
        summary:
          'Dispara agora o job de estoque baixo (o mesmo que o scheduler roda periodicamente), sem esperar o intervalo configurado. Assíncrono: só enfileira.',
        security: [{ bearerAuth: [] }],
        response: { 202: queuedResponseSchema },
      },
    },
    runStockCheckJob,
  );

  // --- Usuária autenticada -----------------------------------------------------

  server.get(
    '/notifications',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Lista as notificações da usuária autenticada, paginado (mais recentes primeiro).',
        security: [{ bearerAuth: [] }],
        querystring: listNotificationsQuerySchema,
        response: { 200: paginatedNotificationsResponseSchema },
      },
    },
    listNotifications,
  );

  server.get(
    '/notifications/unread-count',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Quantas notificações não lidas a usuária autenticada tem.',
        security: [{ bearerAuth: [] }],
        response: { 200: unreadCountResponseSchema },
      },
    },
    getUnreadCount,
  );

  server.patch(
    '/notifications/read-all',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary: 'Marca todas as notificações não lidas da usuária autenticada como lidas.',
        security: [{ bearerAuth: [] }],
        response: { 200: markAllReadResponseSchema },
      },
    },
    markAllNotificationsRead,
  );

  server.patch(
    '/notifications/:id/read',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary:
          'Marca uma notificação como lida (404 se não existir ou não for da usuária autenticada). Idempotente.',
        security: [{ bearerAuth: [] }],
        params: notificationParamsSchema,
        response: { 200: notificationResponseSchema },
      },
    },
    markNotificationRead,
  );

  server.delete(
    '/notifications/:id',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary:
          'Remove uma notificação (404 se não existir ou não for da usuária autenticada).',
        security: [{ bearerAuth: [] }],
        params: notificationParamsSchema,
      },
    },
    removeNotification,
  );

  // --- Token de push do dispositivo (Expo) -------------------------------------

  server.post(
    '/notifications/device-tokens',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary:
          'Registra (ou migra pra esta conta) o token de push Expo do dispositivo da usuária autenticada.',
        security: [{ bearerAuth: [] }],
        body: registerDeviceTokenSchema,
        response: { 200: registerDeviceTokenResponseSchema },
      },
    },
    registerDeviceToken,
  );

  server.delete(
    '/notifications/device-tokens/:token',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['notifications'],
        summary:
          'Remove o token de push do dispositivo (ex.: logout). 404 se não existir ou não for da usuária autenticada.',
        security: [{ bearerAuth: [] }],
        params: deviceTokenParamsSchema,
      },
    },
    unregisterDeviceToken,
  );
}
