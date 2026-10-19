import { buildCatalogLink } from './store.link';
import { isForeignKeyViolation } from '../../database/errors';
import {
  AppError,
  ConflictError,
  NotFoundError,
  PlanLimitError,
} from '../../shared/errors/AppError';
import { catalogRepository, type CatalogRepository } from '../catalog/catalog.repository';
import type { Paginated } from '../catalog/catalog.types';
import { STORE_PLAN_LIMITS, STORE_PLAN_NAMES } from './store.plans';
import { storeRepository, type StoreRepository } from './store.repository';
import type {
  AddStoreProductInput,
  CreateManualStoreProductInput,
  ListStoreProductsQuery,
  UpdateStoreInput,
  UpdateStoreProductInput,
  UpdateStoreSettingsInput,
} from './store.schema';
import type {
  AcceptedPaymentMethod,
  ManualStoreProductComponentInput,
  Store,
  StoreCategory,
  StoreChanges,
  StoreProduct,
  StoreSettings,
  StorePlanUsage,
  StoreSettingsView,
} from './store.types';

// "Leal Perfumaria" -> "lealperfumaria" (sem espaços/acentos/hífens — só o
// sufixo de desempate usa hífen, ex: "lealperfumaria-2").
function slugifyBase(storeName: string): string {
  const base = storeName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return base.length > 0 ? base : 'loja';
}

// Subdomínios que a plataforma usa (ou pode vir a usar): nenhuma loja pode ficar com eles.
const RESERVED_HANDLES = new Set([
  'www', 'api', 'app', 'web', 'admin', 'painel', 'dashboard', 'mail', 'email', 'ftp', 'static',
  'assets', 'cdn', 'docs', 'blog', 'help', 'ajuda', 'suporte', 'support', 'status', 'login',
  'cadastro', 'loja', 'lojas', 'store', 'revendaja',
]); // prettier-ignore

// Mesma resposta para "já é de outra loja" e "reservado": não revela qual dos dois.
function handleUnavailable(): AppError {
  return new AppError('Este link não está disponível. Escolha outro.', 409, 'HANDLE_UNAVAILABLE');
}

const PAYMENT_METHOD_ORDER: AcceptedPaymentMethod[] = ['pix', 'card', 'cash'];

function sortPaymentMethods(methods: AcceptedPaymentMethod[]): AcceptedPaymentMethod[] {
  return PAYMENT_METHOD_ORDER.filter((method) => methods.includes(method));
}

function toSettingsView(settings: StoreSettings): StoreSettingsView {
  return {
    plan: { id: settings.plan, name: STORE_PLAN_NAMES[settings.plan] },
    acceptedPaymentMethods: sortPaymentMethods(settings.acceptedPaymentMethods),
    hideOutOfStock: settings.hideOutOfStock,
  };
}

export class StoreService {
  constructor(
    private readonly repository: StoreRepository = storeRepository,
    private readonly catalog: CatalogRepository = catalogRepository,
  ) {}

  async createStore(userId: string, storeName: string) {
    const existing = await this.repository.findByUserId(userId);
    if (existing) {
      throw new ConflictError('Você já possui uma loja.');
    }

    const handle = await this.generateUniqueHandle(storeName);
    const catalogLink = buildCatalogLink(handle);

    const result = await this.repository.create({ userId, storeName, handle, catalogLink });
    if (result.kind === 'already_exists') {
      throw new ConflictError('Você já possui uma loja.');
    }
    return result.store;
  }

  // Liga/desliga a vitrine e edita nome, link (handle) e descrição. Só grava o que veio, e o que já
  // está igual não conta como mudança: repetir a mesma chamada é seguro (idempotente).
  // Trocar o handle troca o link da vitrine junto — o endereço antigo deixa de funcionar.
  async updateStore(userId: string, input: UpdateStoreInput): Promise<Store> {
    const store = await this.getOwnStoreOrThrow(userId);
    const changes: StoreChanges = {};

    if (input.isOnline !== undefined && input.isOnline !== store.isOnline) {
      changes.isOnline = input.isOnline;
    }
    if (input.storeName !== undefined && input.storeName !== store.storeName) {
      changes.storeName = input.storeName;
    }
    if (input.bio !== undefined) {
      // Vazia ou nula limpa a descrição.
      const bio = input.bio === null || input.bio === '' ? null : input.bio;
      if (bio !== store.bio) changes.bio = bio;
    }
    if (input.handle !== undefined && input.handle !== store.handle) {
      if (RESERVED_HANDLES.has(input.handle)) throw handleUnavailable();
      const owner = await this.repository.findByHandle(input.handle);
      if (owner && owner.id !== store.id) throw handleUnavailable();
      changes.handle = input.handle;
      changes.catalogLink = buildCatalogLink(input.handle);
    }
    if (input.defaultMinStock !== undefined && input.defaultMinStock !== store.defaultMinStock) {
      changes.defaultMinStock = input.defaultMinStock;
    }

    // Nada mudou de verdade: devolve a loja como está, sem tocar no banco.
    if (Object.keys(changes).length === 0) return store;

    const result = await this.repository.updateStore(store.id, changes);
    if (result.kind === 'handle_taken') throw handleUnavailable();

    // O padrão novo também "puxa" quem já estava no padrão ANTIGO (produto que a loja nunca
    // configurou um mínimo próprio) — só não toca em quem já foi customizado individualmente.
    if (changes.defaultMinStock !== undefined) {
      await this.repository.applyDefaultMinStockToExisting(
        store.id,
        store.defaultMinStock,
        changes.defaultMinStock,
      );
    }

    return result.store;
  }

  async setMonthlyGoal(userId: string, monthlyGoal: number): Promise<number> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.repository.setMonthlyGoal(store.id, monthlyGoal);
  }

  // Plano e configurações que a tela Mais mostra.
  async getSettings(userId: string): Promise<StoreSettingsView> {
    const store = await this.getOwnStoreOrThrow(userId);
    const settings = await this.repository.getSettings(store.id);
    if (!settings) {
      throw new NotFoundError('Você ainda não possui uma loja.');
    }
    return toSettingsView(settings);
  }

  // Limites do plano e quanto a loja já usou (hoje, só produtos).
  async getPlanUsage(userId: string): Promise<StorePlanUsage> {
    const store = await this.getOwnStoreOrThrow(userId);
    const [products, frozen] = await Promise.all([
      this.repository.countStoreProducts(store.id),
      this.repository.countFrozenStoreProducts(store.id),
    ]);
    return {
      plan: { id: store.plan, name: STORE_PLAN_NAMES[store.plan] },
      limits: STORE_PLAN_LIMITS[store.plan],
      usage: { products, frozen },
    };
  }

  async updateSettings(
    userId: string,
    input: UpdateStoreSettingsInput,
  ): Promise<StoreSettingsView> {
    const store = await this.getOwnStoreOrThrow(userId);
    const settings = await this.repository.updateSettings(store.id, {
      // Sempre na mesma ordem (Pix, Cartão, Dinheiro), qualquer que seja a ordem em que o app enviou.
      ...(input.acceptedPaymentMethods
        ? { acceptedPaymentMethods: sortPaymentMethods(input.acceptedPaymentMethods) }
        : {}),
      ...(input.hideOutOfStock !== undefined ? { hideOutOfStock: input.hideOutOfStock } : {}),
    });
    return toSettingsView(settings);
  }

  // Produto cadastrado à mão pela loja (ex.: um ursinho, ou uma cesta de presente montada com
  // outros produtos que já estão no estoque). `components` (opcional) é a composição do kit: cada
  // produto listado ali tem o estoque debitado junto, além do estoque do próprio kit, quando ele é
  // vendido (ver `sales.repository#createSale`).
  async addManualProduct(
    userId: string,
    input: CreateManualStoreProductInput,
  ): Promise<StoreProduct> {
    const store = await this.getOwnStoreOrThrow(userId);
    const limits = STORE_PLAN_LIMITS[store.plan];
    if (!limits.manualProductsEnabled) {
      throw new PlanLimitError(
        `Cadastro de produto manual não está disponível no plano ${STORE_PLAN_NAMES[store.plan]}. Faça upgrade para o Inicial ou superior.`,
      );
    }
    await this.ensureProductSlot(store);

    const components = await this.resolveComponents(store.id, input.components);

    return this.repository.createManualStoreProduct({
      storeId: store.id,
      name: input.name,
      description: input.description ?? null,
      image: input.image ?? null,
      price: input.price,
      costPrice: input.costPrice ?? null,
      stock: input.stock,
      // Sem minStock explícito, usa o padrão da loja (ver `defaultMinStock` em "Editar Loja").
      minStock: input.minStock ?? store.defaultMinStock,
      components,
    });
  }

  async addProduct(userId: string, input: AddStoreProductInput): Promise<StoreProduct> {
    const store = await this.getOwnStoreOrThrow(userId);

    const product = await this.catalog.findProductById(input.productId);
    if (!product) {
      throw new NotFoundError('Produto não encontrado no catálogo.');
    }

    const existing = await this.repository.findStoreProductByProductId(store.id, input.productId);
    if (existing) {
      throw new ConflictError('Este produto já está na sua loja.');
    }

    await this.ensureProductSlot(store);

    return this.repository.createStoreProduct({
      storeId: store.id,
      productId: input.productId,
      price: input.price,
      costPrice: input.costPrice ?? null,
      stock: input.stock,
      // Sem minStock explícito, usa o padrão da loja (ver `defaultMinStock` em "Editar Loja").
      minStock: input.minStock ?? store.defaultMinStock,
    });
  }

  async listProducts(
    userId: string,
    query: ListStoreProductsQuery,
  ): Promise<Paginated<StoreProduct>> {
    const store = await this.getOwnStoreOrThrow(userId);
    const { items, total } = await this.repository.listStoreProducts(store.id, query);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async getProduct(userId: string, storeProductId: string): Promise<StoreProduct> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.getOwnStoreProductOrThrow(store.id, storeProductId);
  }

  async updateProduct(
    userId: string,
    storeProductId: string,
    input: UpdateStoreProductInput,
  ): Promise<StoreProduct> {
    const store = await this.getOwnStoreOrThrow(userId);
    const existing = await this.getOwnStoreProductOrThrow(store.id, storeProductId);

    // Nome, descrição, imagem e componentes só existem num produto manual: um produto do catálogo
    // usa o nome/imagem do `Product` e não pode virar kit.
    const manualFieldsSent =
      input.name !== undefined ||
      input.description !== undefined ||
      input.image !== undefined ||
      input.components !== undefined;
    if (manualFieldsSent && existing.kind !== 'manual') {
      throw new AppError(
        'Esses campos só podem ser alterados em um produto manual.',
        400,
        'NOT_MANUAL_PRODUCT',
      );
    }

    // O schema já garante que os dois campos vêm juntos (ou nenhum). O que falta validar aqui é o
    // que depende do preço/estado ATUAL do produto, que o zod não conhece.
    if (input.promoPrice !== undefined && input.promoPrice !== null) {
      const limits = STORE_PLAN_LIMITS[store.plan];
      if (!limits.promotionsEnabled) {
        throw new PlanLimitError(
          `Preço promocional não está disponível no plano ${STORE_PLAN_NAMES[store.plan]}. Faça upgrade para o Inicial ou superior.`,
        );
      }
      const effectivePrice = input.price ?? existing.price;
      if (input.promoPrice >= effectivePrice) {
        throw new AppError(
          'O preço promocional precisa ser menor que o preço normal.',
          400,
          'INVALID_PROMO_PRICE',
        );
      }
    }
    if (
      input.promoEndsAt !== undefined &&
      input.promoEndsAt !== null &&
      input.promoEndsAt.getTime() <= Date.now()
    ) {
      throw new AppError(
        'A validade da promoção precisa ser no futuro.',
        400,
        'INVALID_PROMO_END_DATE',
      );
    }

    if (input.categoryId !== undefined && input.categoryId !== null) {
      const category = await this.repository.findCategoryById(store.id, input.categoryId);
      if (!category) {
        throw new NotFoundError('Categoria não encontrada na sua loja.');
      }
    }

    const components = await this.resolveComponents(store.id, input.components, storeProductId);

    return this.repository.updateStoreProduct(storeProductId, {
      price: input.price,
      costPrice: input.costPrice,
      stock: input.stock,
      minStock: input.minStock,
      isActive: input.isActive,
      categoryId: input.categoryId,
      promoPrice: input.promoPrice,
      promoEndsAt: input.promoEndsAt,
      name: input.name,
      description: input.description,
      image: input.image,
      components,
    });
  }

  async removeProduct(userId: string, storeProductId: string): Promise<void> {
    const store = await this.getOwnStoreOrThrow(userId);
    await this.getOwnStoreProductOrThrow(store.id, storeProductId);
    try {
      await this.repository.deleteStoreProduct(storeProductId);
    } catch (error) {
      // A relação de componente usa `onDelete: Restrict` de propósito: um produto que está sendo
      // usado numa cesta não pode sumir por baixo dela.
      if (isForeignKeyViolation(error)) {
        throw new ConflictError(
          'Este produto faz parte de uma cesta e não pode ser removido. Remova-o da cesta antes.',
        );
      }
      throw error;
    }
    // Apagar um produto abre espaço no limite: se havia produto congelado, o mais antigo volta.
    await this.repository.reconcileFrozenProducts(
      store.id,
      STORE_PLAN_LIMITS[store.plan].maxProducts,
    );
  }

  async listCategories(userId: string): Promise<StoreCategory[]> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.repository.listCategories(store.id);
  }

  async createCategory(userId: string, name: string): Promise<StoreCategory> {
    const store = await this.getOwnStoreOrThrow(userId);
    const limits = STORE_PLAN_LIMITS[store.plan];
    if (!limits.categoriesEnabled) {
      throw new PlanLimitError(
        `Categorias não estão disponíveis no plano ${STORE_PLAN_NAMES[store.plan]}. Faça upgrade para o Inicial ou superior.`,
      );
    }
    const result = await this.repository.createCategory(store.id, name.trim());
    if (result.kind === 'already_exists') {
      throw new ConflictError('Você já tem uma categoria com esse nome.');
    }
    return result.category;
  }

  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    const store = await this.getOwnStoreOrThrow(userId);
    const category = await this.repository.findCategoryById(store.id, categoryId);
    if (!category) {
      throw new NotFoundError('Categoria não encontrada na sua loja.');
    }
    await this.repository.deleteCategory(categoryId);
  }

  // Barra a criação de mais um produto (catálogo ou manual) quando a loja já está no teto do
  // plano. `maxProducts: null` (Pro/Empresarial) nunca consulta o banco.
  private async ensureProductSlot(store: Store): Promise<void> {
    const limits = STORE_PLAN_LIMITS[store.plan];
    if (limits.maxProducts === null) return;

    const count = await this.repository.countStoreProducts(store.id);
    if (count >= limits.maxProducts) {
      throw new PlanLimitError(
        `Seu plano ${STORE_PLAN_NAMES[store.plan]} permite até ${limits.maxProducts} produtos. Faça upgrade para adicionar mais.`,
      );
    }
  }

  private async getOwnStoreOrThrow(userId: string): Promise<Store> {
    const store = await this.repository.findByUserId(userId);
    if (!store) {
      throw new NotFoundError('Você ainda não possui uma loja.');
    }
    return store;
  }

  // Valida uma lista de componentes de kit antes de criar/editar um produto manual: cada um precisa
  // pertencer à MESMA loja e não pode ele mesmo ter componentes (sem kit-dentro-de-kit — evita
  // ciclos e cálculo recursivo de estoque na venda). `kitId` (só na edição) barra um produto virar
  // componente de si mesmo. undefined = não mexe nos componentes atuais; [] = kit vira "sem kit".
  private async resolveComponents(
    storeId: string,
    input: ManualStoreProductComponentInput[] | undefined,
    kitId?: string,
  ): Promise<{ componentId: string; quantity: number }[] | undefined> {
    if (input === undefined) return undefined;
    if (input.length === 0) return [];

    if (kitId && input.some((component) => component.storeProductId === kitId)) {
      throw new AppError(
        'Um produto não pode ser componente dele mesmo.',
        400,
        'SELF_COMPONENT_NOT_ALLOWED',
      );
    }

    // Mesma invariante de baixo, na direção contrária: um produto que já é COMPONENTE de outro kit
    // não pode ganhar componentes e virar kit também. Sem isso, vender o kit "avô" nunca decrementa
    // o estoque dos componentes do "nieto" — a venda só resolve 1 nível de componente (ver
    // sales.repository#createSale) — e o estoque desses produtos fica errado pra sempre, em
    // silêncio.
    if (kitId && (await this.repository.isComponentOfAnotherKit(kitId))) {
      throw new AppError(
        'Este produto já é componente de outra cesta e não pode virar uma cesta também.',
        400,
        'NESTED_KIT_NOT_ALLOWED',
      );
    }

    const ids = input.map((component) => component.storeProductId);
    const candidates = await this.repository.findComponentCandidates(storeId, ids);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    for (const { storeProductId } of input) {
      const candidate = byId.get(storeProductId);
      if (!candidate) {
        throw new NotFoundError(
          'Um dos produtos escolhidos como componente não foi encontrado na sua loja.',
        );
      }
      if (candidate.hasComponents) {
        throw new AppError(
          'Um produto que já é uma cesta não pode ser usado como componente de outra cesta.',
          400,
          'NESTED_KIT_NOT_ALLOWED',
        );
      }
    }

    return input.map((component) => ({
      componentId: component.storeProductId,
      quantity: component.quantity,
    }));
  }

  private async getOwnStoreProductOrThrow(
    storeId: string,
    storeProductId: string,
  ): Promise<StoreProduct> {
    const storeProduct = await this.repository.findStoreProductById(storeId, storeProductId);
    if (!storeProduct) {
      throw new NotFoundError('Produto não encontrado na sua loja.');
    }
    return storeProduct;
  }

  private async generateUniqueHandle(storeName: string): Promise<string> {
    const base = slugifyBase(storeName);
    let candidate = base;
    let suffix = 2;

    while (await this.repository.findByHandle(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}

export const storeService = new StoreService();
