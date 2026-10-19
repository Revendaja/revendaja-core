import { z } from 'zod';

export const notificationTypeSchema = z.enum(['SYSTEM', 'STOCK_LOW', 'GOAL', 'PROMOTION']);

const titleSchema = z.string().trim().min(1).max(120);
const messageSchema = z.string().trim().min(1).max(500);

// --- Admin: disparo manual ---------------------------------------------------

export const notifyAllSchema = z.object({
  title: titleSchema,
  message: messageSchema,
  type: notificationTypeSchema.default('SYSTEM'),
});

export const notifyPlanSchema = z.object({
  plan: z.enum(['free', 'starter', 'premium', 'business']),
  title: titleSchema,
  message: messageSchema,
  type: notificationTypeSchema.default('SYSTEM'),
});

export const notifyUserParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const notifyUserSchema = z.object({
  title: titleSchema,
  message: messageSchema,
  type: notificationTypeSchema.default('SYSTEM'),
});

export const queuedResponseSchema = z.object({ queued: z.literal(true) });

// --- Usuária: listagem e leitura ---------------------------------------------

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const notificationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  isRead: z.boolean(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

export const paginatedNotificationsResponseSchema = z.object({
  items: z.array(notificationResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export const unreadCountResponseSchema = z.object({ count: z.number().int() });
export const markAllReadResponseSchema = z.object({ updated: z.number().int() });

// --- Tokens de push (dispositivo) --------------------------------------------

export const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(1).max(200),
  platform: z.enum(['ios', 'android']).optional(),
});

export const deviceTokenParamsSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

export const registerDeviceTokenResponseSchema = z.object({ registered: z.literal(true) });

export type NotifyAllInput = z.infer<typeof notifyAllSchema>;
export type NotifyPlanInput = z.infer<typeof notifyPlanSchema>;
export type NotifyUserInput = z.infer<typeof notifyUserSchema>;
export type NotifyUserParams = z.infer<typeof notifyUserParamsSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationParams = z.infer<typeof notificationParamsSchema>;
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
export type DeviceTokenParams = z.infer<typeof deviceTokenParamsSchema>;
