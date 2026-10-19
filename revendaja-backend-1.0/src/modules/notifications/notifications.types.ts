// Categoria de conteúdo da notificação — independente de quem recebe (ALL/PLAN/USER é resolvido
// no momento do envio, ver notifications.service.ts, não fica gravado aqui).
export type NotificationType = 'SYSTEM' | 'STOCK_LOW' | 'GOAL' | 'PROMOTION';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  // Payload livre pra navegação no app (ex.: { action: "OPEN_STOCK", productId, storeProductId }).
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
}

// Cria a MESMA notificação (mesmo título/mensagem/tipo) pra vários usuários de uma vez — usado
// pelo worker do job `notification:fanout` (broadcast ALL/PLAN), em lotes.
export interface CreateNotificationsForUsersInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  message: string;
}
