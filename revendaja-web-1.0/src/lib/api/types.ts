export type AuthUser = {
  id: string;
  name: string;
  email: string;
  // null até a usuária completar o cadastro (conta criada via Google que ainda não informou o WhatsApp).
  whatsapp: string | null;
};

export type StorePlanId = 'free' | 'starter' | 'premium' | 'business';

export type StoreInfo = {
  id: string;
  storeName: string;
  handle: string;
  catalogLink: string;
  isOnline: boolean;
  // Descrição curta da loja (topo da vitrine). null = ainda não escreveu.
  bio: string | null;
  // Estoque mínimo aplicado automaticamente a cada NOVO produto adicionado. 0 = sem padrão.
  defaultMinStock: number;
  createdAt: string;
};

// Resposta de POST /auth/register, POST /auth/login e POST /auth/google.
export type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  isVerified: boolean;
  hasStore: boolean;
  // true quando falta completar o cadastro (só acontece em conta criada via Google): a tela deve
  // pedir o WhatsApp antes de seguir para o fluxo normal (verificação/criar loja).
  needsWhatsapp: boolean;
};

// Resposta de GET /me.
export type MeResponse = {
  user: AuthUser;
  isVerified: boolean;
  store: StoreInfo | null;
};

export type RegisterInput = {
  name: string;
  email: string;
  whatsapp: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

// ---------------------------------------------------------------------------
// Início (GET /home)
// ---------------------------------------------------------------------------

export type LowStockProduct = {
  storeProductId: string;
  name: string;
  stock: number;
};

export type HomeSummary = {
  plan: { id: StorePlanId; name: string };
  revenue: {
    // Só vendas PAGAS do mês.
    total: number;
    // Variação sobre o mês anterior. null = o mês anterior não teve vendas.
    growthPercent: number | null;
  };
  // null = a loja ainda não escolheu a meta.
  goal: {
    target: number;
    // 0 a 100.
    percent: number;
    // 0 quando a meta foi batida.
    remaining: number;
  } | null;
  alerts: {
    lowStock: {
      threshold: number;
      count: number;
      products: LowStockProduct[];
    };
    pendingSales: { count: number };
  };
};

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

// `card` cobre débito e crédito. `on_account` (fiado) não existe mais para vendas novas: só aparece em vendas antigas.
export type SalePaymentMethod = 'pix' | 'card' | 'cash' | 'on_account';
// Formas de pagamento aceitas ao registrar uma venda nova (toda venda nova já nasce paga).
export type NewSalePaymentMethod = Exclude<SalePaymentMethod, 'on_account'>;
export type SaleStatusValue = 'paid' | 'pending' | 'cancelled';
// `online` = pedido feito pelo cliente na vitrine (sempre nasce pendente); `manual` = registrada pela loja no app.
export type SaleSource = 'manual' | 'online';
// Como o cliente recebe o pedido da vitrine: busca na loja ou a loja entrega.
export type FulfillmentMethod = 'pickup' | 'delivery';

export type SaleItemDetail = {
  storeProductId: string | null;
  productName: string;
  productImageSm: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type SaleListItem = {
  id: string;
  // Sequência inteira por loja ("Venda #42").
  number: number;
  createdAt: string;
  status: SaleStatusValue;
  source: SaleSource;
  paymentMethod: SalePaymentMethod;
  // null quando não é cartão.
  installments: number | null;
  total: number;
  customerName: string;
  customerWhatsapp: string | null;
  // Só o pedido online informa. null = venda registrada pela própria loja.
  fulfillment: FulfillmentMethod | null;
};

export type SaleDetail = SaleListItem & {
  items: SaleItemDetail[];
  // Só com `fulfillment = delivery`.
  deliveryAddress: string | null;
  // Entrega paga em dinheiro: "troco para quanto". null = não precisa de troco.
  cashChangeFor: number | null;
};

export type CreateSaleInput = {
  clientRequestId: string;
  customerName: string;
  paymentMethod: NewSalePaymentMethod;
  // Só com `card` (1 a 24). Com outro método a API responde 400.
  installments?: number;
  items: { storeProductId: string; quantity: number }[];
};

export type SalesSummary = {
  // Todas as vendas do período (pagas + pendentes), pela data de criação.
  grossRevenue: number;
  pendingTotal: number;
  // Só itens de vendas pagas que têm custo. null se nenhum tiver custo. Pode ser negativo.
  profit: number | null;
  marginPercent: number | null;
  // true se existe item pago sem custo (o lucro ignora esses itens).
  profitIsPartial: boolean;
};

// ---------------------------------------------------------------------------
// Evolução das vendas (GET /sales/timeline)
// ---------------------------------------------------------------------------

export type TimelineGroupBy = 'day' | 'week' | 'month';

export type SalesTimeline = {
  groupBy: TimelineGroupBy;
  // true se existe item pago sem custo cadastrado (o custo ignora esses itens).
  costIsPartial: boolean;
  items: {
    // Início do dia/semana/mês (ISO, instante UTC).
    periodStart: string;
    // Vendas pagas.
    revenue: number;
    cost: number;
  }[];
};

// ---------------------------------------------------------------------------
// Marcas mais vendidas (GET /sales/top-brands)
// ---------------------------------------------------------------------------

export type TopBrand = {
  brandId: number;
  name: string;
  logo: string | null;
  quantitySold: number;
  // Só vendas pagas.
  revenue: number;
};

// ---------------------------------------------------------------------------
// Relatórios: mais vendidos / parados (GET /sales/top-products, /sales/stale-products)
// ---------------------------------------------------------------------------

export type TopProduct = {
  storeProductId: string;
  name: string;
  image: string | null;
  quantitySold: number;
  // Só vendas pagas.
  revenue: number;
};

export type StaleProduct = {
  storeProductId: string;
  name: string;
  image: string | null;
  stock: number;
  price: number;
  // null = nunca vendido (não só "sem venda no período").
  lastSoldAt: string | null;
};

// ---------------------------------------------------------------------------
// Limites do plano (GET /store/plan)
// ---------------------------------------------------------------------------

export type StorePlanUsage = {
  plan: { id: StorePlanId; name: string };
  limits: {
    // null = sem limite de produtos.
    maxProducts: number | null;
    manualProductsEnabled: boolean;
    categoriesEnabled: boolean;
    promotionsEnabled: boolean;
  };
  usage: { products: number; frozen: number };
};

// ---------------------------------------------------------------------------
// Vitrine (GET /store/stats)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Configurações da vitrine (GET/PATCH /store/settings)
// ---------------------------------------------------------------------------

export type StoreSettings = {
  plan: { id: StorePlanId; name: string };
  // Formas de pagamento que a vitrine aceita: sempre ao menos uma, sem fiado, em ordem fixa (Pix, Cartão, Dinheiro).
  acceptedPaymentMethods: NewSalePaymentMethod[];
  // Some da vitrine o produto com estoque zerado.
  hideOutOfStock: boolean;
};

export type StoreSettingsChanges = Partial<Pick<StoreSettings, 'acceptedPaymentMethods' | 'hideOutOfStock'>>;

export type StoreStats = {
  // Visitas à vitrine nos últimos 7 dias.
  visitsLast7Days: number;
  // Pedidos feitos pelos clientes na vitrine (de qualquer período e status).
  ordersCount: number;
};

// ---------------------------------------------------------------------------
// Notificações (GET /notifications)
// ---------------------------------------------------------------------------

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type NotificationType = 'SYSTEM' | 'STOCK_LOW' | 'GOAL' | 'PROMOTION';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  // Payload livre pra navegação (ex.: { action: 'OPEN_STOCK' }). null = sem ação.
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Produtos da loja (GET /store/products)
// ---------------------------------------------------------------------------

export type StoreProduct = {
  // UUID do vínculo loja-produto (usado em PATCH/DELETE).
  id: string;
  kind: 'catalog' | 'manual';
  price: number;
  costPrice: number | null;
  promoPrice: number | null;
  promoEndsAt: string | null;
  // Calculado no servidor: a promoção só vale se ainda não venceu.
  isPromoActive: boolean;
  stock: number;
  // 0 = alerta de estoque baixo desligado.
  minStock: number;
  isActive: boolean;
  // Acima do limite de produtos do plano: fora da vitrine, mas pode ser apagado.
  isFrozen: boolean;
  createdAt: string;
  updatedAt: string;
  product: {
    // null em produto manual (não vem do catálogo global).
    id: number | null;
    name: string;
    barCode: string | null;
    brandSku: string | null;
    description: string | null;
    productImage: string | null;
    productImageSm: string | null;
    // Preço SUGERIDO pelo catálogo. 0 = sem preço sugerido (cerca de 30% dos produtos).
    basePrice: number;
    brand: { id: number | null; name: string; logo: string | null; profitability: number };
  };
  category: { id: string; name: string } | null;
  // Componentes deste produto quando ele é um kit. Vazio para produtos comuns.
  components: StoreProductComponent[];
};

export type StoreCategory = {
  id: string;
  name: string;
  productCount: number;
};

export type StoreProductSort = 'recent' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc';

// ---------------------------------------------------------------------------
// Catálogo global (GET /catalog/...)
// ---------------------------------------------------------------------------

export type Brand = {
  id: number;
  name: string;
  logo: string | null;
  // Inteiro informativo (ex.: 15, 30, 50).
  profitability: number;
};

export type CatalogProduct = {
  id: number;
  name: string;
  barCode: string | null;
  brandSku: string | null;
  description: string | null;
  productImage: string | null;
  productImageSm: string | null;
  // Preço SUGERIDO pelo catálogo. 0 = sem preço sugerido.
  basePrice: number;
  brand: Brand;
};

// Um componente do "kit" (produto manual composto, ex.: uma cesta de presente).
export type StoreProductComponent = {
  id: string;
  storeProductId: string;
  name: string;
  image: string | null;
  price: number;
  stock: number;
  quantity: number;
};

// ---------------------------------------------------------------------------
// Vitrine pública (GET /public/stores/:handle, POST /public/stores/:handle/orders)
// ---------------------------------------------------------------------------

export type StorefrontProduct = {
  // Id do produto DA LOJA: é o que o pedido recebe.
  id: string;
  name: string;
  description: string | null;
  brand: string;
  image: string | null;
  imageSm: string | null;
  price: number;
  // null quando não há promoção ativa.
  promoPrice: number | null;
  isPromoActive: boolean;
  inStock: boolean;
  // Cadastrado há pouco tempo (selo "Novo").
  isNew: boolean;
};

export type Storefront = {
  store: {
    storeName: string;
    handle: string;
    bio: string | null;
    acceptedPaymentMethods: NewSalePaymentMethod[];
  };
  products: Paginated<StorefrontProduct>;
};

// --- Página inicial da vitrine e personalização (GET /public/stores/:handle/home) ---------------------

export const BENEFIT_ICONS = ['truck', 'card', 'shield', 'chat', 'gift', 'star'] as const;
export type BenefitIcon = (typeof BENEFIT_ICONS)[number];

export type CollectionSection = 'featured' | 'offers' | 'new' | 'catalog';

export type CollectionLink =
  | { type: 'section'; section: CollectionSection }
  | { type: 'category'; id: string }
  | { type: 'brand'; id: number };

export type StorefrontConfig = {
  announcement: { enabled: boolean; text: string; rightText: string | null };
  hero: {
    badge: string;
    title: string;
    highlight: string;
    subtitle: string;
    primaryLabel: string;
    secondaryLabel: string;
    imageUrl: string | null;
  };
  benefits: { icon: BenefitIcon; title: string; text: string }[];
  flash: { enabled: boolean; title: string; subtitle: string; imageUrl: string | null };
  collections: {
    title: string;
    subtitle: string;
    ctaLabel: string;
    imageUrl: string | null;
    link: CollectionLink;
  }[];
};

export type StorefrontSection = keyof StorefrontConfig;

// Atalho de categoria: nasce do que a loja vende (categoria própria ou marca).
export type StorefrontCategory = {
  type: 'category' | 'brand';
  id: string;
  name: string;
  count: number;
  image: string | null;
};

export type StorefrontHome = {
  store: {
    storeName: string;
    handle: string;
    bio: string | null;
    acceptedPaymentMethods: NewSalePaymentMethod[];
    // Planos Pro e Empresarial tiram a marca do Revendajá do rodapé.
    hideBranding: boolean;
  };
  config: StorefrontConfig;
  categories: StorefrontCategory[];
  featured: StorefrontProduct[];
  offers: { products: StorefrontProduct[]; endsAt: string | null };
  newArrivals: StorefrontProduct[];
};

// GET/PUT /store/storefront (painel): o que vale, os padrões e quais seções a loja personalizou.
export type StorefrontCustomization = {
  config: StorefrontConfig;
  defaults: StorefrontConfig;
  customized: Record<StorefrontSection, boolean>;
};

export type CreateOrderInput = {
  clientRequestId: string;
  customerName: string;
  customerWhatsapp: string;
  fulfillment: FulfillmentMethod;
  // Obrigatório na entrega (8 a 300 caracteres); proibido na retirada.
  deliveryAddress?: string;
  paymentMethod: NewSalePaymentMethod;
  // Só com `card` (1 a 24).
  installments?: number;
  // Só entrega paga em dinheiro: troco para quanto (>= total). Ausente = não precisa de troco.
  cashChangeFor?: number;
  items: { storeProductId: string; quantity: number }[];
};

export type OnlineOrderReceipt = {
  number: number;
  status: SaleStatusValue;
  total: number;
  paymentMethod: SalePaymentMethod;
  installments: number | null;
  customerName: string;
  fulfillment: FulfillmentMethod;
  deliveryAddress: string | null;
  cashChangeFor: number | null;
  createdAt: string;
  // Até quando o pedido espera o pagamento: depois disso é cancelado sozinho e o estoque volta.
  expiresAt: string;
  items: { productName: string; quantity: number; unitPrice: number; subtotal: number }[];
};
