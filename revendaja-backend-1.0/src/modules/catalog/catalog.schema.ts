import { z } from 'zod';

export const listCatalogProductsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  brandId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const catalogProductParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const catalogBrandResponseSchema = z.object({
  id: z.number().nullable(),
  name: z.string(),
  logo: z.string().nullable(),
  profitability: z.number(),
});

export const catalogProductResponseSchema = z.object({
  id: z.number().nullable(),
  name: z.string(),
  barCode: z.string().nullable(),
  brandSku: z.string().nullable(),
  description: z.string().nullable(),
  productImage: z.string().nullable(),
  productImageSm: z.string().nullable(),
  basePrice: z.number(),
  brand: catalogBrandResponseSchema,
});

export const paginatedCatalogProductsResponseSchema = z.object({
  items: z.array(catalogProductResponseSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export type ListCatalogProductsQuery = z.infer<typeof listCatalogProductsQuerySchema>;
export type CatalogProductParams = z.infer<typeof catalogProductParamsSchema>;
