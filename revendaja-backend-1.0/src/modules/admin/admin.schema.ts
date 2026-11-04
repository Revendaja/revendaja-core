import { z } from 'zod';

export const adminStoresQuerySchema = z.object({
  search: z.string().trim().min(1).max(80).optional(),
  plan: z.enum(['free', 'starter', 'premium', 'business']).optional(),
  sort: z.enum(['created', 'gmv', 'ai', 'lastSale']).default('created'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const adminAiQuerySchema = z.object({
  // "AAAA-MM". Ausente = mês atual.
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato AAAA-MM.')
    .optional(),
});

export type AdminStoresQuery = z.infer<typeof adminStoresQuerySchema>;
export type AdminAiQuery = z.infer<typeof adminAiQuerySchema>;
