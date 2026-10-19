import type { StorePlanLimits } from './store.plans';
import type { CatalogProduct } from '../catalog/catalog.types';

export interface Store {
  id: string;
  userId: string;
  storeName: string;
  handle: string;
  catalogLink: string;
  isOnline: boolean;
  // Descrição curta da loja (topo da vitrine). null = a loja não escreveu uma.
  bio: string | null;
  // Plano da loja: define os limites de produtos e quais recursos estão liberados
  // (ver `STORE_PLAN_LIMITS` em `store.plans.ts`).
  plan: StorePlan;
  // Estoque mínimo padrão: valor inicial de `StoreProduct.minStock` pra produto NOVO (0 = sem
  // padrão), e também aplicado a quem já está na loja e ainda segue o padrão antigo quando esse
  // valor muda (ver StoreService#updateStore).
  defaultMinStock: number;
  createdAt: Date;
}

// O que "Minha Loja" e "Editar Loja" podem alterar (cada campo é opcional: só muda o que vier).
export interface StoreChanges {
  isOnline?: boolean;
  storeName?: string;
  handle?: string;
  // Sempre muda junto com o handle: o link é https://{handle}.{domínio}.
  catalogLink?: string;
  bio?: string | null;
  defaultMinStock?: number;
}

export type UpdateStoreResult =
  | { kind: 'updated'; store: Store }
  // Outra loja pegou esse link no mesmo instante (o índice único do banco recusou).
  | { kind: 'handle_taken' };

export type CreateStoreResult =
  | { kind: 'created'; store: Store }
  // Corrida: a usuária já tem loja OU o handle foi pego por outra loja entre a checagem e o
  // INSERT (índice único do banco recusou) — ver StoreRepository#create.
  | { kind: 'already_exists' };

export type StorePlan = 'free' | 'starter' | 'premium' | 'business';

// Formas de pagamento que a vitrine pode aceitar. Não inclui fiado (`on_account`), que não existe mais.
export type AcceptedPaymentMethod = 'pix' | 'card' | 'cash';

// Configurações da loja (Home e tela Mais). `monthlyGoal` null = a loja ainda não escolheu a meta.
export interface StoreSettings {
  monthlyGoal: number | null;
  plan: StorePlan;
  acceptedPaymentMethods: AcceptedPaymentMethod[];
  hideOutOfStock: boolean;
}

// O que a tela Mais pode alterar (cada campo é opcional: só muda o que vier).
export interface StoreSettingsChanges {
  acceptedPaymentMethods?: AcceptedPaymentMethod[];
  hideOutOfStock?: boolean;
}

// Como a API devolve as configurações da tela Mais.
export interface StoreSettingsView {
  plan: { id: StorePlan; name: string };
  acceptedPaymentMethods: AcceptedPaymentMethod[];
  hideOutOfStock: boolean;
}

// Plano da loja com limites e uso atual.
export interface StorePlanUsage {
  plan: { id: StorePlan; name: string };
  limits: StorePlanLimits;
  // `frozen`: quantos produtos passam do limite do plano e estão congelados.
  usage: { products: number; frozen: number };
}

// Produto da loja com estoque baixo (alerta da Home).
export interface LowStockProduct {
  storeProductId: string;
  name: string;
  stock: number;
}

// Produto com estoque mínimo configurado (minStock > 0) — candidato à notificação automática de
// estoque baixo (ver notifications.stockCheck.ts). `userId` é o dono da loja, pra quem a
// notificação vai.
export interface LowStockCandidate {
  storeProductId: string;
  storeId: string;
  userId: string;
  name: string;
  stock: number;
  minStock: number;
  lowStockNotifiedAt: Date | null;
}

// Loja com meta mensal definida — candidata à notificação de progresso de meta.
export interface StoreGoalCandidate {
  storeId: string;
  userId: string;
  monthlyGoal: number;
}

// Loja cuja última notificação promocional (ou criação, se nunca notificada) já passou do
// intervalo configurado — candidata à notificação promocional automática.
export interface StorePromotionCandidate {
  storeId: string;
  userId: string;
}

export type StoreProductKind = 'catalog' | 'manual';

// Categoria própria da loja (ver `StoreCategory` no schema). `productCount` conta só produtos ativos
// e inativos da loja nessa categoria (não é afetado por outras lojas).
export interface StoreCategory {
  id: string;
  name: string;
  productCount: number;
}

// Um componente do "kit" (produto manual composto, ex.: uma cesta de presente): outro produto da
// MESMA loja que é debitado do estoque junto quando o kit é vendido.
export interface StoreProductComponentView {
  // Id do vínculo (StoreProductComponent), não do produto — só usado se a UI precisar removê-lo.
  id: string;
  // Id do StoreProduct que é o componente (do catálogo ou manual).
  storeProductId: string;
  name: string;
  image: string | null;
  price: number;
  stock: number;
  quantity: number;
}

// Representa "a loja tem este produto": ou importado do catálogo (`kind: 'catalog'`, `product` vem
// de `Product`) ou cadastrado à mão (`kind: 'manual'`, `product` é sintetizado a partir dos campos
// próprios do StoreProduct — ver `store.repository#mapStoreProduct`). O mesmo `Product` do catálogo
// pode estar em várias lojas, cada uma com seu próprio `price`.
export interface StoreProduct {
  id: string;
  storeId: string;
  kind: StoreProductKind;
  price: number;
  costPrice: number | null;
  // Preço promocional (desconto temporário) e sua validade. Os dois vêm juntos: os dois nulos = sem
  // promoção. `isPromoActive` já leva em conta se a validade passou (calculado no servidor).
  promoPrice: number | null;
  promoEndsAt: Date | null;
  isPromoActive: boolean;
  stock: number;
  // Estoque mínimo configurado pela loja para este produto. 0 = alerta de estoque baixo desligado
  // (ver o job `notification:stock-check`, em src/modules/notifications).
  minStock: number;
  isActive: boolean;
  // Acima do limite de produtos do plano: some da vitrine e não vende online, mas pode ser apagado.
  isFrozen: boolean;
  createdAt: Date;
  updatedAt: Date;
  product: CatalogProduct;
  category: { id: string; name: string } | null;
  // Componentes deste produto quando ele é um kit. Vazio para produtos comuns.
  components: StoreProductComponentView[];
}

export interface ManualStoreProductComponentInput {
  storeProductId: string;
  quantity: number;
}

export interface CreateManualStoreProductInput {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  costPrice?: number | null;
  stock: number;
  components?: ManualStoreProductComponentInput[];
}
