import { z } from 'zod';

export const adminStoresQuerySchema = z.object({
  search: z.string().trim().min(1).max(80).optional(),
  plan: z.enum(['free', 'starter', 'premium']).optional(),
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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const adminCreateCatalogProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  brandId: z.number().int().positive(),
  // Código de barras: só dígitos (8 a 14), como a busca do app espera.
  barCode: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, 'O código de barras deve ter de 8 a 14 dígitos.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  brandSku: optionalText(80),
  description: optionalText(2000),
  basePrice: z.number().positive().max(100000),
  // URL devolvida por /admin/uploads/catalog-image.
  productImage: z.string().url().max(500),
});

// Edição parcial. `barCode`/`brandSku`/`description` aceitam null para LIMPAR o campo.
export const adminUpdateCatalogProductSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    brandId: z.number().int().positive(),
    barCode: z
      .string()
      .trim()
      .regex(/^\d{8,14}$/, 'O código de barras deve ter de 8 a 14 dígitos.')
      .nullable(),
    brandSku: z.string().trim().max(80).nullable(),
    description: z.string().trim().max(2000).nullable(),
    basePrice: z.number().positive().max(100000),
    productImage: z.string().url().max(500),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para alterar.');

export const adminCatalogProductParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export const adminDeleteCatalogProductQuerySchema = z.object({
  // Sem `force`, produto que alguma loja usa não é removido (a remoção some com ele das lojas).
  force: z.enum(['true', 'false']).default('false'),
});

export type AdminUpdateCatalogProduct = z.infer<typeof adminUpdateCatalogProductSchema>;
export type AdminCreateCatalogProduct = z.infer<typeof adminCreateCatalogProductSchema>;
export type AdminStoresQuery = z.infer<typeof adminStoresQuerySchema>;
export type AdminAiQuery = z.infer<typeof adminAiQuerySchema>;
