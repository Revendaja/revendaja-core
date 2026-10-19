import { NotFoundError } from '../../shared/errors/AppError';
import { catalogRepository, type CatalogRepository } from './catalog.repository';
import type { ListCatalogProductsQuery } from './catalog.schema';
import type { CatalogProduct, Paginated } from './catalog.types';

export class CatalogService {
  constructor(private readonly repository: CatalogRepository = catalogRepository) {}

  listBrands() {
    return this.repository.listBrands();
  }

  async listProducts(query: ListCatalogProductsQuery): Promise<Paginated<CatalogProduct>> {
    const { items, total } = await this.repository.listProducts(query);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async getProduct(id: number): Promise<CatalogProduct> {
    const product = await this.repository.findProductById(id);
    if (!product) {
      throw new NotFoundError('Produto não encontrado no catálogo.');
    }
    return product;
  }
}

export const catalogService = new CatalogService();
