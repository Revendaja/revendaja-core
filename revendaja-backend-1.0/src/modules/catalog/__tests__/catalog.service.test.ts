import { CatalogService } from '../catalog.service';
import { NotFoundError } from '../../../shared/errors/AppError';
import type { CatalogRepository } from '../catalog.repository';
import type { CatalogProduct } from '../catalog.types';

function createRepositoryMock(): jest.Mocked<CatalogRepository> {
  return {
    listBrands: jest.fn(),
    listProducts: jest.fn(),
    findProductById: jest.fn(),
  };
}

function buildCatalogProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 1,
    name: 'Desodorante Colônia',
    barCode: null,
    brandSku: '123',
    description: null,
    productImage: null,
    productImageSm: null,
    basePrice: 99.9,
    brand: { id: 1, name: 'Natura', logo: null, profitability: 30 },
    ...overrides,
  };
}

describe('CatalogService', () => {
  it('lista produtos paginados repassando page/pageSize da query', async () => {
    const repository = createRepositoryMock();
    repository.listProducts.mockResolvedValue({ items: [buildCatalogProduct()], total: 1 });
    const service = new CatalogService(repository);

    const result = await service.listProducts({ page: 2, pageSize: 10 });

    expect(repository.listProducts).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    expect(result).toEqual({ items: [buildCatalogProduct()], page: 2, pageSize: 10, total: 1 });
  });

  it('lança NotFoundError quando o produto não existe no catálogo', async () => {
    const repository = createRepositoryMock();
    repository.findProductById.mockResolvedValue(null);
    const service = new CatalogService(repository);

    await expect(service.getProduct(999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('retorna o produto quando ele existe no catálogo', async () => {
    const repository = createRepositoryMock();
    const product = buildCatalogProduct();
    repository.findProductById.mockResolvedValue(product);
    const service = new CatalogService(repository);

    await expect(service.getProduct(1)).resolves.toEqual(product);
  });
});
