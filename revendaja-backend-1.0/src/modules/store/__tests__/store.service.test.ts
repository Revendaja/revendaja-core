import { StoreService } from '../store.service';
import { AppError, ConflictError, NotFoundError, PlanLimitError } from '../../../shared/errors/AppError';
import type { CatalogRepository } from '../../catalog/catalog.repository';
import type { CatalogProduct } from '../../catalog/catalog.types';
import type { StoreRepository } from '../store.repository';
import type { Store, StoreProduct } from '../store.types';

function createRepositoryMock(): jest.Mocked<StoreRepository> {
  return {
    findByUserId: jest.fn(),
    findByHandle: jest.fn(),
    create: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    updateStore: jest.fn(),
    applyDefaultMinStockToExisting: jest.fn().mockResolvedValue(0),
    setMonthlyGoal: jest.fn(),
    findLowStock: jest.fn(),
    countStoreProducts: jest.fn().mockResolvedValue(0),
    countFrozenStoreProducts: jest.fn().mockResolvedValue(0),
    reconcileFrozenProducts: jest.fn().mockResolvedValue(undefined),
    findStoreProductByProductId: jest.fn(),
    findStoreProductById: jest.fn(),
    listStoreProducts: jest.fn(),
    createStoreProduct: jest.fn(),
    createManualStoreProduct: jest.fn(),
    findComponentCandidates: jest.fn().mockResolvedValue([]),
    isComponentOfAnotherKit: jest.fn().mockResolvedValue(false),
    updateStoreProduct: jest.fn(),
    deleteStoreProduct: jest.fn(),
    listCategories: jest.fn(),
    createCategory: jest.fn(),
    findCategoryById: jest.fn(),
    deleteCategory: jest.fn(),
    findProductsWithMinStockConfigured: jest.fn(),
    claimLowStockNotification: jest.fn(),
    resetLowStockNotification: jest.fn(),
    findStoresWithMonthlyGoal: jest.fn(),
    findStoresDueForPromotion: jest.fn(),
    markPromotionNotified: jest.fn(),
  };
}

function createCatalogRepositoryMock(): jest.Mocked<CatalogRepository> {
  return {
    listBrands: jest.fn(),
    listProducts: jest.fn(),
    findProductById: jest.fn(),
  };
}

function buildStore(overrides: Partial<Store> = {}): Store {
  return {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    userId: 'user-1',
    storeName: 'Leal Perfumaria',
    handle: 'lealperfumaria',
    catalogLink: 'https://lealperfumaria.revendaja.com',
    isOnline: true,
    bio: null,
    // Pro por padrão nos testes: sem limite de produtos e com tudo liberado, a menos que o teste
    // troque o plano de propósito pra exercitar um limite específico.
    plan: 'premium',
    defaultMinStock: 0,
    createdAt: new Date(),
    ...overrides,
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

function buildStoreProduct(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 'sp-1',
    storeId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    kind: 'catalog',
    price: 129.9,
    costPrice: null,
    promoPrice: null,
    promoEndsAt: null,
    isPromoActive: false,
    stock: 0,
    minStock: 0,
    isActive: true,
    isFrozen: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    product: buildCatalogProduct(),
    category: null,
    components: [],
    ...overrides,
  };
}

describe('StoreService', () => {
  it('lança ConflictError quando o usuário já tem uma loja', async () => {
    const repository = createRepositoryMock();
    repository.findByUserId.mockResolvedValue(buildStore());
    const service = new StoreService(repository);

    await expect(service.createStore('user-1', 'Nova Loja')).rejects.toBeInstanceOf(ConflictError);
  });

  it('corrida: outra requisição cria a loja (ou pega o handle) entre a checagem e o insert: 409 ConflictError', async () => {
    const repository = createRepositoryMock();
    repository.findByUserId.mockResolvedValue(null);
    repository.findByHandle.mockResolvedValue(null);
    repository.create.mockResolvedValue({ kind: 'already_exists' });
    const service = new StoreService(repository);

    await expect(service.createStore('user-1', 'Nova Loja')).rejects.toBeInstanceOf(ConflictError);
  });

  it('gera o handle removendo espaços e acentos, sem hífen', async () => {
    const repository = createRepositoryMock();
    repository.findByUserId.mockResolvedValue(null);
    repository.findByHandle.mockResolvedValue(null);
    repository.create.mockImplementation((data) => Promise.resolve({ kind: 'created' as const, store: buildStore(data) }));
    const service = new StoreService(repository);

    const store = await service.createStore('user-1', 'Leal Perfumaria');

    expect(store.handle).toBe('lealperfumaria');
    expect(store.catalogLink).toBe('https://lealperfumaria.revendaja.com');
  });

  it('resolve colisão de handle com sufixo numérico incremental', async () => {
    const repository = createRepositoryMock();
    repository.findByUserId.mockResolvedValue(null);
    repository.findByHandle.mockImplementation((handle) =>
      Promise.resolve(
        handle === 'lealperfumaria' || handle === 'lealperfumaria-2'
          ? buildStore({ handle })
          : null,
      ),
    );
    repository.create.mockImplementation((data) => Promise.resolve({ kind: 'created' as const, store: buildStore(data) }));
    const service = new StoreService(repository);

    const store = await service.createStore('user-1', 'Leal Perfumaria');

    expect(store.handle).toBe('lealperfumaria-3');
  });

  it('usa um handle de fallback quando o nome da loja não gera nenhum caractere válido', async () => {
    const repository = createRepositoryMock();
    repository.findByUserId.mockResolvedValue(null);
    repository.findByHandle.mockResolvedValue(null);
    repository.create.mockImplementation((data) => Promise.resolve({ kind: 'created' as const, store: buildStore(data) }));
    const service = new StoreService(repository);

    const store = await service.createStore('user-1', '🎉🎉🎉');

    expect(store.handle).toBe('loja');
  });

  describe('addProduct', () => {
    it('lança NotFoundError quando o usuário não tem loja', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      repository.findByUserId.mockResolvedValue(null);
      const service = new StoreService(repository, catalog);

      await expect(
        service.addProduct('user-1', { productId: 1, price: 10, stock: 0, minStock: 0 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lança NotFoundError quando o produto não existe no catálogo', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      catalog.findProductById.mockResolvedValue(null);
      const service = new StoreService(repository, catalog);

      await expect(
        service.addProduct('user-1', { productId: 1, price: 10, stock: 0, minStock: 0 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lança ConflictError quando o produto já foi importado pela loja', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(buildStoreProduct());
      const service = new StoreService(repository, catalog);

      await expect(
        service.addProduct('user-1', { productId: 1, price: 10, stock: 0, minStock: 0 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('importa o produto do catálogo com o preço informado pela loja', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      const store = buildStore();
      repository.findByUserId.mockResolvedValue(store);
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.createStoreProduct.mockResolvedValue(buildStoreProduct({ price: 55 }));
      const service = new StoreService(repository, catalog);

      const result = await service.addProduct('user-1', {
        productId: 1,
        price: 55,
        stock: 12,
        minStock: 0,
      });

      expect(repository.createStoreProduct).toHaveBeenCalledWith({
        storeId: store.id,
        productId: 1,
        price: 55,
        costPrice: null,
        stock: 12,
        minStock: 0,
      });
      expect(result.price).toBe(55);
    });

    it('sem minStock explícito, usa o defaultMinStock da loja', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      const store = buildStore({ defaultMinStock: 2 });
      repository.findByUserId.mockResolvedValue(store);
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.createStoreProduct.mockResolvedValue(buildStoreProduct({ minStock: 2 }));
      const service = new StoreService(repository, catalog);

      await service.addProduct('user-1', { productId: 1, price: 55, stock: 12 });

      expect(repository.createStoreProduct).toHaveBeenCalledWith(
        expect.objectContaining({ minStock: 2 }),
      );
    });

    it('minStock explícito (mesmo 0) tem prioridade sobre o defaultMinStock da loja', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      const store = buildStore({ defaultMinStock: 2 });
      repository.findByUserId.mockResolvedValue(store);
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.createStoreProduct.mockResolvedValue(buildStoreProduct({ minStock: 0 }));
      const service = new StoreService(repository, catalog);

      await service.addProduct('user-1', { productId: 1, price: 55, stock: 12, minStock: 0 });

      expect(repository.createStoreProduct).toHaveBeenCalledWith(
        expect.objectContaining({ minStock: 0 }),
      );
    });

    it('grava o preço de custo informado', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      const store = buildStore();
      repository.findByUserId.mockResolvedValue(store);
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.createStoreProduct.mockResolvedValue(buildStoreProduct({ costPrice: 30 }));
      const service = new StoreService(repository, catalog);

      const result = await service.addProduct('user-1', {
        productId: 1,
        price: 55,
        costPrice: 30,
        stock: 0,
        minStock: 0,
      });

      expect(repository.createStoreProduct).toHaveBeenCalledWith({
        storeId: store.id,
        productId: 1,
        price: 55,
        costPrice: 30,
        stock: 0,
        minStock: 0,
      });
      expect(result.costPrice).toBe(30);
    });

    it('devolve o estoque informado ao adicionar', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.createStoreProduct.mockResolvedValue(buildStoreProduct({ stock: 12 }));
      const service = new StoreService(repository, catalog);

      const result = await service.addProduct('user-1', {
        productId: 1,
        price: 55,
        stock: 12,
        minStock: 0,
      });

      expect(result.stock).toBe(12);
    });

    it('lança PlanLimitError quando a loja Gratuita já está nos 30 produtos', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'free' }));
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.countStoreProducts.mockResolvedValue(30);
      const service = new StoreService(repository, catalog);

      await expect(
        service.addProduct('user-1', { productId: 1, price: 55, stock: 0, minStock: 0 }),
      ).rejects.toBeInstanceOf(PlanLimitError);
      expect(repository.createStoreProduct).not.toHaveBeenCalled();
    });

    it('loja Gratuita com menos de 30 produtos ainda pode importar do catálogo', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      const store = buildStore({ plan: 'free' });
      repository.findByUserId.mockResolvedValue(store);
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.countStoreProducts.mockResolvedValue(29);
      repository.createStoreProduct.mockResolvedValue(buildStoreProduct());
      const service = new StoreService(repository, catalog);

      await expect(
        service.addProduct('user-1', { productId: 1, price: 55, stock: 0, minStock: 0 }),
      ).resolves.toBeDefined();
    });

    it('loja Pro (produtos ilimitados) nunca consulta a contagem de produtos', async () => {
      const repository = createRepositoryMock();
      const catalog = createCatalogRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'premium' }));
      catalog.findProductById.mockResolvedValue(buildCatalogProduct());
      repository.findStoreProductByProductId.mockResolvedValue(null);
      repository.createStoreProduct.mockResolvedValue(buildStoreProduct());
      const service = new StoreService(repository, catalog);

      await service.addProduct('user-1', { productId: 1, price: 55, stock: 0, minStock: 0 });

      expect(repository.countStoreProducts).not.toHaveBeenCalled();
    });
  });

  describe('addManualProduct (limites de plano)', () => {
    it('lança PlanLimitError no plano Gratuito (cadastro manual não liberado)', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'free' }));
      const service = new StoreService(repository);

      await expect(
        service.addManualProduct('user-1', { name: 'Ursinho', price: 20, stock: 1, minStock: 0 }),
      ).rejects.toBeInstanceOf(PlanLimitError);
      expect(repository.createManualStoreProduct).not.toHaveBeenCalled();
    });

    it('lança PlanLimitError no plano Inicial já no teto de 200 produtos', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'starter' }));
      repository.countStoreProducts.mockResolvedValue(200);
      const service = new StoreService(repository);

      await expect(
        service.addManualProduct('user-1', { name: 'Ursinho', price: 20, stock: 1, minStock: 0 }),
      ).rejects.toBeInstanceOf(PlanLimitError);
      expect(repository.createManualStoreProduct).not.toHaveBeenCalled();
    });

    it('plano Inicial abaixo do teto cadastra normalmente', async () => {
      const repository = createRepositoryMock();
      const store = buildStore({ plan: 'starter' });
      repository.findByUserId.mockResolvedValue(store);
      repository.countStoreProducts.mockResolvedValue(199);
      repository.createManualStoreProduct.mockResolvedValue(buildStoreProduct({ kind: 'manual' }));
      const service = new StoreService(repository);

      await expect(
        service.addManualProduct('user-1', { name: 'Ursinho', price: 20, stock: 1, minStock: 0 }),
      ).resolves.toBeDefined();
    });

    it('sem minStock explícito, usa o defaultMinStock da loja', async () => {
      const repository = createRepositoryMock();
      const store = buildStore({ plan: 'starter', defaultMinStock: 3 });
      repository.findByUserId.mockResolvedValue(store);
      repository.createManualStoreProduct.mockResolvedValue(
        buildStoreProduct({ kind: 'manual', minStock: 3 }),
      );
      const service = new StoreService(repository);

      await service.addManualProduct('user-1', { name: 'Ursinho', price: 20, stock: 1 });

      expect(repository.createManualStoreProduct).toHaveBeenCalledWith(
        expect.objectContaining({ minStock: 3 }),
      );
    });
  });

  describe('createCategory (limites de plano)', () => {
    it('lança PlanLimitError no plano Gratuito (categorias não liberadas)', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'free' }));
      const service = new StoreService(repository);

      await expect(service.createCategory('user-1', 'Perfumaria')).rejects.toBeInstanceOf(
        PlanLimitError,
      );
      expect(repository.createCategory).not.toHaveBeenCalled();
    });

    it('cria a categoria normalmente a partir do plano Inicial', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'starter' }));
      repository.createCategory.mockResolvedValue({
        kind: 'created',
        category: { id: 'cat-1', name: 'Perfumaria', productCount: 0 },
      });
      const service = new StoreService(repository);

      await expect(service.createCategory('user-1', 'Perfumaria')).resolves.toEqual({
        id: 'cat-1',
        name: 'Perfumaria',
        productCount: 0,
      });
    });
  });

  describe('getProduct', () => {
    it('lança NotFoundError quando o produto não pertence à loja da usuária', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(null);
      const service = new StoreService(repository);

      await expect(service.getProduct('user-1', 'sp-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('retorna o produto quando pertence à loja da usuária', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct({ id: 'sp-1' }));
      const service = new StoreService(repository);

      const result = await service.getProduct('user-1', 'sp-1');

      expect(repository.findStoreProductById).toHaveBeenCalledWith(
        '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        'sp-1',
      );
      expect(result.id).toBe('sp-1');
    });
  });

  describe('updateProduct', () => {
    it('lança NotFoundError quando o produto não pertence à loja da usuária', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(null);
      const service = new StoreService(repository);

      await expect(service.updateProduct('user-1', 'sp-1', { price: 20 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('atualiza o preço de um produto da própria loja', async () => {
      const repository = createRepositoryMock();
      const store = buildStore();
      repository.findByUserId.mockResolvedValue(store);
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct());
      repository.updateStoreProduct.mockResolvedValue(buildStoreProduct({ price: 20 }));
      const service = new StoreService(repository);

      const result = await service.updateProduct('user-1', 'sp-1', { price: 20 });

      expect(repository.updateStoreProduct).toHaveBeenCalledWith('sp-1', { price: 20 });
      expect(result.price).toBe(20);
    });

    it('limpa o custo quando recebe costPrice null', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct({ costPrice: 30 }));
      repository.updateStoreProduct.mockResolvedValue(buildStoreProduct({ costPrice: null }));
      const service = new StoreService(repository);

      const result = await service.updateProduct('user-1', 'sp-1', { costPrice: null });

      expect(repository.updateStoreProduct).toHaveBeenCalledWith('sp-1', { costPrice: null });
      expect(result.costPrice).toBeNull();
    });

    it('atualiza só o estoque, sem mexer no preço', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct());
      repository.updateStoreProduct.mockResolvedValue(buildStoreProduct({ stock: 7 }));
      const service = new StoreService(repository);

      const result = await service.updateProduct('user-1', 'sp-1', { stock: 7 });

      expect(repository.updateStoreProduct).toHaveBeenCalledWith('sp-1', { stock: 7 });
      expect(result.stock).toBe(7);
    });

    it('lança PlanLimitError ao tentar definir promoção no plano Gratuito', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'free' }));
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct({ price: 55 }));
      const service = new StoreService(repository);

      const future = new Date(Date.now() + 86_400_000);
      await expect(
        service.updateProduct('user-1', 'sp-1', { promoPrice: 39.9, promoEndsAt: future }),
      ).rejects.toBeInstanceOf(PlanLimitError);
      expect(repository.updateStoreProduct).not.toHaveBeenCalled();
    });

    it('remover a promoção (os dois campos nulos) é permitido mesmo no plano Gratuito', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore({ plan: 'free' }));
      repository.findStoreProductById.mockResolvedValue(
        buildStoreProduct({ price: 55, promoPrice: 39.9 }),
      );
      repository.updateStoreProduct.mockResolvedValue(
        buildStoreProduct({ price: 55, promoPrice: null, promoEndsAt: null }),
      );
      const service = new StoreService(repository);

      await expect(
        service.updateProduct('user-1', 'sp-1', { promoPrice: null, promoEndsAt: null }),
      ).resolves.toBeDefined();
    });

    it('não deixa um produto que já é COMPONENTE de outro kit ganhar componentes (virar kit também)', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct({ kind: 'manual' }));
      repository.isComponentOfAnotherKit.mockResolvedValue(true);
      const service = new StoreService(repository);

      const error = await service
        .updateProduct('user-1', 'sp-1', { components: [{ storeProductId: 'sp-2', quantity: 1 }] })
        .catch((e: unknown) => e);

      expect(repository.isComponentOfAnotherKit).toHaveBeenCalledWith('sp-1');
      expect((error as AppError).code).toBe('NESTED_KIT_NOT_ALLOWED');
      expect(repository.updateStoreProduct).not.toHaveBeenCalled();
    });

    it('esvaziar os componentes (kit vira "sem kit") não checa nested-kit', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct({ kind: 'manual' }));
      repository.updateStoreProduct.mockResolvedValue(
        buildStoreProduct({ kind: 'manual', components: [] }),
      );
      const service = new StoreService(repository);

      await expect(
        service.updateProduct('user-1', 'sp-1', { components: [] }),
      ).resolves.toBeDefined();
      expect(repository.isComponentOfAnotherKit).not.toHaveBeenCalled();
    });
  });

  describe('removeProduct', () => {
    it('lança NotFoundError quando o produto não pertence à loja da usuária', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(null);
      const service = new StoreService(repository);

      await expect(service.removeProduct('user-1', 'sp-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('remove um produto da própria loja', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct());
      const service = new StoreService(repository);

      await service.removeProduct('user-1', 'sp-1');

      expect(repository.deleteStoreProduct).toHaveBeenCalledWith('sp-1');
    });

    it('depois de apagar, recalcula os produtos congelados pelo limite do plano', async () => {
      const repository = createRepositoryMock();
      const store = buildStore({ plan: 'free' });
      repository.findByUserId.mockResolvedValue(store);
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct());
      const service = new StoreService(repository);

      await service.removeProduct('user-1', 'sp-1');

      expect(repository.reconcileFrozenProducts).toHaveBeenCalledWith(store.id, 30);
    });

    it('não recalcula nada se a remoção falhou', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.findStoreProductById.mockResolvedValue(buildStoreProduct());
      repository.deleteStoreProduct.mockRejectedValue(new Error('boom'));
      const service = new StoreService(repository);

      await expect(service.removeProduct('user-1', 'sp-1')).rejects.toThrow('boom');
      expect(repository.reconcileFrozenProducts).not.toHaveBeenCalled();
    });
  });

  describe('setMonthlyGoal', () => {
    it('lança NotFoundError quando a usuária não tem loja', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(null);
      const service = new StoreService(repository);

      await expect(service.setMonthlyGoal('user-1', 5000)).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.setMonthlyGoal).not.toHaveBeenCalled();
    });

    it('grava a meta na loja da usuária e devolve o valor gravado', async () => {
      const repository = createRepositoryMock();
      const store = buildStore();
      repository.findByUserId.mockResolvedValue(store);
      repository.setMonthlyGoal.mockResolvedValue(5000);
      const service = new StoreService(repository);

      await expect(service.setMonthlyGoal('user-1', 5000)).resolves.toBe(5000);
      expect(repository.setMonthlyGoal).toHaveBeenCalledWith(store.id, 5000);
    });
  });

  describe('settings (tela Mais)', () => {
    const SETTINGS = {
      monthlyGoal: null,
      plan: 'free' as const,
      acceptedPaymentMethods: ['pix', 'card', 'cash'] as ('pix' | 'card' | 'cash')[],
      hideOutOfStock: true,
    };

    it('getSettings: lança NotFoundError quando a usuária não tem loja', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(null);
      const service = new StoreService(repository);

      await expect(service.getSettings('user-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('getSettings: lança NotFoundError se a loja sumiu entre as consultas', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.getSettings.mockResolvedValue(null);
      const service = new StoreService(repository);

      await expect(service.getSettings('user-1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each([
      ['free', 'Gratuito'],
      ['starter', 'Inicial'],
      ['premium', 'Pro'],
      ['business', 'Empresarial'],
    ] as const)('getSettings: plano %s vira "%s"', async (plan, name) => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.getSettings.mockResolvedValue({ ...SETTINGS, plan });
      const service = new StoreService(repository);

      const view = await service.getSettings('user-1');

      expect(view.plan).toEqual({ id: plan, name });
    });

    it('getSettings: devolve as formas de pagamento sempre em Pix, Cartão, Dinheiro', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(buildStore());
      repository.getSettings.mockResolvedValue({
        ...SETTINGS,
        acceptedPaymentMethods: ['cash', 'pix'],
      });
      const service = new StoreService(repository);

      const view = await service.getSettings('user-1');

      expect(view.acceptedPaymentMethods).toEqual(['pix', 'cash']);
    });

    it('updateSettings: lança NotFoundError quando a usuária não tem loja', async () => {
      const repository = createRepositoryMock();
      repository.findByUserId.mockResolvedValue(null);
      const service = new StoreService(repository);

      await expect(
        service.updateSettings('user-1', { hideOutOfStock: false }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.updateSettings).not.toHaveBeenCalled();
    });

    it('updateSettings: grava só o que veio, na loja da usuária, e devolve a visão atualizada', async () => {
      const repository = createRepositoryMock();
      const store = buildStore();
      repository.findByUserId.mockResolvedValue(store);
      repository.updateSettings.mockResolvedValue({
        ...SETTINGS,
        plan: 'starter',
        hideOutOfStock: false,
      });
      const service = new StoreService(repository);

      const view = await service.updateSettings('user-1', { hideOutOfStock: false });

      // `false` é um valor enviado (desliga), não "campo ausente".
      expect(repository.updateSettings).toHaveBeenCalledWith(store.id, { hideOutOfStock: false });
      expect(view).toEqual({
        plan: { id: 'starter', name: 'Inicial' },
        acceptedPaymentMethods: ['pix', 'card', 'cash'],
        hideOutOfStock: false,
      });
    });

    it('updateSettings: ordena as formas de pagamento antes de gravar', async () => {
      const repository = createRepositoryMock();
      const store = buildStore();
      repository.findByUserId.mockResolvedValue(store);
      repository.updateSettings.mockResolvedValue({
        ...SETTINGS,
        acceptedPaymentMethods: ['pix', 'cash'],
      });
      const service = new StoreService(repository);

      await service.updateSettings('user-1', { acceptedPaymentMethods: ['cash', 'pix'] });

      expect(repository.updateSettings).toHaveBeenCalledWith(store.id, {
        acceptedPaymentMethods: ['pix', 'cash'],
      });
    });
  });

  describe('updateStore (Minha Loja e Editar Loja)', () => {
    function setup(overrides: Partial<Store> = {}) {
      const repository = createRepositoryMock();
      const store = buildStore(overrides);
      repository.findByUserId.mockResolvedValue(store);
      repository.findByHandle.mockResolvedValue(null);
      repository.updateStore.mockImplementation((_id, changes) =>
        Promise.resolve({ kind: 'updated', store: { ...store, ...changes } }),
      );
      return { repository, store, service: new StoreService(repository) };
    }

    it('lança NotFoundError quando a usuária não tem loja', async () => {
      const { repository, service } = setup();
      repository.findByUserId.mockResolvedValue(null);

      await expect(service.updateStore('user-1', { isOnline: false })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(repository.updateStore).not.toHaveBeenCalled();
    });

    it.each([[true], [false]])(
      'isOnline = %s: liga/desliga a loja da usuária',
      async (isOnline) => {
        const { repository, store, service } = setup({ isOnline: !isOnline });

        const result = await service.updateStore('user-1', { isOnline });

        // `false` é um valor enviado (desliga), não "campo ausente".
        expect(repository.updateStore).toHaveBeenCalledWith(store.id, { isOnline });
        expect(result.isOnline).toBe(isOnline);
      },
    );

    it('nome e descrição: grava só o que mudou', async () => {
      const { repository, store, service } = setup();

      await service.updateStore('user-1', {
        storeName: 'Nova Perfumaria',
        bio: 'Cosméticos com entrega rápida.',
      });

      expect(repository.updateStore).toHaveBeenCalledWith(store.id, {
        storeName: 'Nova Perfumaria',
        bio: 'Cosméticos com entrega rápida.',
      });
    });

    it.each([[''], [null]])('bio %j LIMPA a descrição (vira null)', async (bio) => {
      const { repository, store, service } = setup({ bio: 'Descrição antiga' });

      await service.updateStore('user-1', { bio });

      expect(repository.updateStore).toHaveBeenCalledWith(store.id, { bio: null });
    });

    it('trocar o link (handle) troca o catalogLink junto', async () => {
      const { repository, store, service } = setup();

      const result = await service.updateStore('user-1', { handle: 'nova-loja' });

      expect(repository.findByHandle).toHaveBeenCalledWith('nova-loja');
      expect(repository.updateStore).toHaveBeenCalledWith(store.id, {
        handle: 'nova-loja',
        catalogLink: 'https://nova-loja.revendaja.com',
      });
      expect(result.catalogLink).toBe('https://nova-loja.revendaja.com');
    });

    it('link que já é de OUTRA loja: 409 HANDLE_UNAVAILABLE e nada é gravado', async () => {
      const { repository, service } = setup();
      repository.findByHandle.mockResolvedValue(
        buildStore({ id: 'outra-loja', handle: 'nova-loja' }),
      );

      const error = await service
        .updateStore('user-1', { handle: 'nova-loja' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
      expect((error as AppError).code).toBe('HANDLE_UNAVAILABLE');
      expect(repository.updateStore).not.toHaveBeenCalled();
    });

    it.each([['www'], ['api'], ['admin'], ['suporte'], ['revendaja']])(
      'link reservado "%s": 409 HANDLE_UNAVAILABLE (sem nem consultar o banco)',
      async (handle) => {
        const { repository, service } = setup();

        const error = await service.updateStore('user-1', { handle }).catch((e: unknown) => e);

        expect((error as AppError).code).toBe('HANDLE_UNAVAILABLE');
        expect(repository.findByHandle).not.toHaveBeenCalled();
        expect(repository.updateStore).not.toHaveBeenCalled();
      },
    );

    it('corrida: outra loja pegou o link no mesmo instante (índice único do banco): 409', async () => {
      const { repository, service } = setup();
      repository.updateStore.mockResolvedValue({ kind: 'handle_taken' });

      const error = await service
        .updateStore('user-1', { handle: 'nova-loja' })
        .catch((e: unknown) => e);

      expect((error as AppError).code).toBe('HANDLE_UNAVAILABLE');
    });

    it('o próprio link da loja não conta como "em uso" (mesmo handle = nada a mudar)', async () => {
      const { repository, store, service } = setup();

      const result = await service.updateStore('user-1', { handle: store.handle });

      expect(repository.findByHandle).not.toHaveBeenCalled();
      expect(repository.updateStore).not.toHaveBeenCalled();
      expect(result).toBe(store);
    });

    it('nada mudou de verdade: devolve a loja sem tocar no banco (idempotente)', async () => {
      const { repository, store, service } = setup({ isOnline: true, bio: 'Igual' });

      const result = await service.updateStore('user-1', {
        isOnline: true,
        storeName: store.storeName,
        bio: 'Igual',
      });

      expect(repository.updateStore).not.toHaveBeenCalled();
      expect(result).toBe(store);
    });

    it('todos os campos de uma vez', async () => {
      const { repository, store, service } = setup();

      await service.updateStore('user-1', {
        isOnline: false,
        storeName: 'Outra Loja',
        handle: 'outraloja',
        bio: 'Texto',
      });

      expect(repository.updateStore).toHaveBeenCalledWith(store.id, {
        isOnline: false,
        storeName: 'Outra Loja',
        handle: 'outraloja',
        catalogLink: 'https://outraloja.revendaja.com',
        bio: 'Texto',
      });
    });

    it('trocar o defaultMinStock aplica o valor novo em quem ainda está no padrão antigo', async () => {
      const { repository, store, service } = setup({ defaultMinStock: 0 });

      await service.updateStore('user-1', { defaultMinStock: 5 });

      expect(repository.updateStore).toHaveBeenCalledWith(store.id, { defaultMinStock: 5 });
      expect(repository.applyDefaultMinStockToExisting).toHaveBeenCalledWith(store.id, 0, 5);
    });

    it('defaultMinStock igual ao já gravado: não toca na loja nem nos produtos', async () => {
      const { repository, service } = setup({ defaultMinStock: 3 });

      const result = await service.updateStore('user-1', { defaultMinStock: 3 });

      expect(repository.updateStore).not.toHaveBeenCalled();
      expect(repository.applyDefaultMinStockToExisting).not.toHaveBeenCalled();
      expect(result.defaultMinStock).toBe(3);
    });
  });
});
