import { z } from 'zod';
import { isoDateTime } from '../sales/sales.schema';

// Como em `/sales/summary`, o app manda os limites já calculados no fuso do aparelho
// (ISO-8601 com Z ou offset). O período atual é [from, to) e o anterior, que só serve
// para calcular o crescimento, é [previousFrom, from) — o mês anterior, colado no atual.
// Os três são obrigatórios: sem eles o app poderia exibir, sem perceber, números de
// outro período.
export const homeQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
    previousFrom: isoDateTime,
  })
  .refine((data) => data.previousFrom < data.from && data.from < data.to, {
    message: 'Use previousFrom < from < to.',
    path: ['from'],
  });

export const homeResponseSchema = z.object({
  plan: z.object({
    id: z.enum(['free', 'starter', 'premium', 'business']),
    name: z.string(),
  }),
  revenue: z.object({
    total: z.number(),
    growthPercent: z.number().nullable(),
  }),
  goal: z
    .object({
      target: z.number(),
      percent: z.number(),
      remaining: z.number(),
    })
    .nullable(),
  alerts: z.object({
    lowStock: z.object({
      threshold: z.number().int(),
      count: z.number().int(),
      products: z.array(
        z.object({
          storeProductId: z.string().uuid(),
          name: z.string(),
          stock: z.number().int(),
        }),
      ),
    }),
    pendingSales: z.object({
      count: z.number().int(),
    }),
  }),
});

export type HomeQuery = z.infer<typeof homeQuerySchema>;
