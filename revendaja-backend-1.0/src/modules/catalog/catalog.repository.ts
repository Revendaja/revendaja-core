import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { buildProductSearchFilter } from './catalog.search';
import type { CatalogBrand, CatalogProduct } from './catalog.types';

type ProductWithBrand = Prisma.ProductGetPayload<{ include: { brand: true } }>;

// Prisma devolve preços como `Decimal` (decimal.js) para não perder precisão
// no banco — convertemos pra `number` aqui, na borda que fala com o Prisma,
// pra o resto da aplicação (service/schema de resposta) trabalhar só com
// tipos JSON-serializáveis.
export function mapCatalogProduct(row: ProductWithBrand): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    barCode: row.barCode,
    brandSku: row.brandSku,
    description: row.description,
    productImage: row.productImage,
    productImageSm: row.productImageSm,
    basePrice: row.basePrice.toNumber(),
    brand: {
      id: row.brand.id,
      name: row.brand.name,
      logo: row.brand.logo,
      profitability: row.brand.profitability,
    },
  };
}

interface ListProductsFilter {
  search?: string;
  brandId?: number;
  page: number;
  pageSize: number;
}

export const catalogRepository = {
  async listBrands(): Promise<CatalogBrand[]> {
    const rows = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      logo: row.logo,
      profitability: row.profitability,
    }));
  },

  async listProducts(
    filter: ListProductsFilter,
  ): Promise<{ items: CatalogProduct[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      ...(filter.brandId ? { brandId: filter.brandId } : {}),
      ...(filter.search ? await buildProductSearchFilter(filter.search) : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { brand: true },
        orderBy: { name: 'asc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return { items: rows.map(mapCatalogProduct), total };
  },

  async findProductById(id: number): Promise<CatalogProduct | null> {
    const row = await prisma.product.findUnique({ where: { id }, include: { brand: true } });
    return row ? mapCatalogProduct(row) : null;
  },
};

export type CatalogRepository = typeof catalogRepository;
