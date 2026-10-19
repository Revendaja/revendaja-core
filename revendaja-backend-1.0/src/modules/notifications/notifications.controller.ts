import type { FastifyReply, FastifyRequest } from 'fastify';
import { JOB_STOCK_CHECK, notificationsQueue } from '../../shared/queue/queues';
import { notificationsService } from './notifications.service';
import type {
  DeviceTokenParams,
  ListNotificationsQuery,
  NotificationParams,
  NotifyAllInput,
  NotifyPlanInput,
  NotifyUserInput,
  NotifyUserParams,
  RegisterDeviceTokenInput,
} from './notifications.schema';

export async function notifyAll(
  request: FastifyRequest<{ Body: NotifyAllInput }>,
  reply: FastifyReply,
) {
  await notificationsService.notifyAll(request.body);
  return reply.status(202).send({ queued: true });
}

export async function notifyPlan(
  request: FastifyRequest<{ Body: NotifyPlanInput }>,
  reply: FastifyReply,
) {
  const { plan, ...rest } = request.body;
  await notificationsService.notifyByPlan(plan, rest);
  return reply.status(202).send({ queued: true });
}

export async function notifyUser(
  request: FastifyRequest<{ Params: NotifyUserParams; Body: NotifyUserInput }>,
  reply: FastifyReply,
) {
  const notification = await notificationsService.notifyUser(request.params.userId, request.body);
  return reply.status(201).send(notification);
}

// Disparo manual do job periódico de estoque baixo (ver notifications.stockCheck.ts), só pra
// testar sem esperar o intervalo do scheduler. Enfileira o MESMO job que o scheduler enfileira, e
// quem processa é o worker rodando no próprio processo do servidor (ver server.ts).
export async function runStockCheckJob(_request: FastifyRequest, reply: FastifyReply) {
  await notificationsQueue.add(JOB_STOCK_CHECK, {});
  return reply.status(202).send({ queued: true });
}

export async function listNotifications(
  request: FastifyRequest<{ Querystring: ListNotificationsQuery }>,
  reply: FastifyReply,
) {
  const result = await notificationsService.list(request.userId as string, request.query);
  return reply.send(result);
}

export async function getUnreadCount(request: FastifyRequest, reply: FastifyReply) {
  const count = await notificationsService.unreadCount(request.userId as string);
  return reply.send({ count });
}

export async function markNotificationRead(
  request: FastifyRequest<{ Params: NotificationParams }>,
  reply: FastifyReply,
) {
  const notification = await notificationsService.markRead(
    request.userId as string,
    request.params.id,
  );
  return reply.send(notification);
}

export async function markAllNotificationsRead(request: FastifyRequest, reply: FastifyReply) {
  const updated = await notificationsService.markAllRead(request.userId as string);
  return reply.send({ updated });
}

export async function removeNotification(
  request: FastifyRequest<{ Params: NotificationParams }>,
  reply: FastifyReply,
) {
  await notificationsService.remove(request.userId as string, request.params.id);
  return reply.status(204).send();
}

export async function registerDeviceToken(
  request: FastifyRequest<{ Body: RegisterDeviceTokenInput }>,
  reply: FastifyReply,
) {
  await notificationsService.registerDeviceToken(
    request.userId as string,
    request.body.token,
    request.body.platform,
  );
  return reply.send({ registered: true });
}

export async function unregisterDeviceToken(
  request: FastifyRequest<{ Params: DeviceTokenParams }>,
  reply: FastifyReply,
) {
  await notificationsService.unregisterDeviceToken(request.userId as string, request.params.token);
  return reply.status(204).send();
}
