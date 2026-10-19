export type AuthUser = {
  id: string;
  name: string;
  email: string;
  // null até a usuária completar o cadastro (conta criada via Google que ainda não informou o WhatsApp).
  whatsapp: string | null;
};

export type StoreInfo = {
  id: string;
  storeName: string;
  handle: string;
  catalogLink: string;
  isOnline: boolean;
  // Descrição curta da loja (topo da vitrine). null = ainda não escreveu.
  bio: string | null;
  // Estoque mínimo aplicado automaticamente a cada NOVO produto adicionado (catálogo ou manual).
  // 0 = sem padrão (o produto nasce com o alerta de estoque baixo desligado).
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
  // true quando falta completar o cadastro (só acontece em conta criada via Google): o app deve
  // pedir o WhatsApp antes de seguir para o fluxo normal (verificação/criar loja).
  needsWhatsapp: boolean;
};

// Resposta de GET /me.
export type MeResponse = {
  user: AuthUser;
  isVerified: boolean;
  store: StoreInfo | null;
};

export type Brand = {
  id: number;
  name: string;
  logo: string | null;
  // Inteiro informativo (ex.: 15, 30, 50). Não é usado em cálculos no app.
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
  // Preço SUGERIDO pelo catálogo, em reais. Cerca de 30% dos produtos têm 0 ("sem preço sugerido").
  basePrice: number;
  brand: Brand;
};

// O `product` embutido num StoreProduct: igual ao CatalogProduct, mas `id`/`brand.id` são `null`
// quando o produto é manual (ver StoreProduct.kind) — ele não tem vínculo com o catálogo global, e
// a API sintetiza esses campos (ex.: `brand.name = 'Produto Próprio'`) pra essa tela continuar
// funcionando sem precisar tratar os dois casos separadamente.
export type StoreProductDisplay = Omit<CatalogProduct, 'id' | 'brand'> & {
  id: number | null;
  brand: Omit<Brand, 'id'> & { id: number | null };
};

// Categoria própria da loja (criada livremente, não é uma lista fixa da plataforma).
export type StoreCategory = {
  id: string;
  name: string;
  productCount: number;
};

// Um componente do "kit" (produto manual composto, ex.: uma cesta de presente): outro produto da
// MESMA loja que é debitado do estoque junto quando o kit é vendido.
export type StoreProductComponent = {
  // Id do vínculo, não do produto componente em si (só usado pra removê-lo da lista).
  id: string;
  // Id do StoreProduct que é o componente (do catálogo ou manual).
  storeProductId: string;
  name: string;
  image: string | null;
  price: number;
  stock: number;
  quantity: number;
};

// Produto que a loja tem: importado do catálogo (`kind: 'catalog'`) ou cadastrado à mão
// (`kind: 'manual'`, ex.: um ursinho ou uma cesta). `id` é o UUID do vínculo loja-produto (usado em
// PATCH/DELETE); não é o id numérico do catálogo (`product.id`).
export type StoreProduct = {
  id: string;
  kind: 'catalog' | 'manual';
  price: number;
  isActive: boolean;
  // Acima do limite de produtos do plano: fora da vitrine e sem vender online, mas pode ser apagado.
  isFrozen: boolean;
  // Preço de custo (opcional). null = não informado; 0 é um custo válido e diferente de "não informado".
  costPrice: number | null;
  // Preço promocional (desconto temporário) e sua validade. Os dois vêm juntos: null = sem promoção.
  // `isPromoActive` já leva em conta se a validade passou (calculado no servidor).
  promoPrice: number | null;
  promoEndsAt: string | null;
  isPromoActive: boolean;
  // Quantidade em estoque (inteiro, 0 a 1.000.000). É por loja: o catálogo global não tem estoque.
  stock: number;
  createdAt: string;
  updatedAt: string;
  product: StoreProductDisplay;
  category: { id: string; name: string } | null;
  // Componentes deste produto quando ele é um kit. Vazio para produtos comuns.
  components: StoreProductComponent[];
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
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
// Vendas
// ---------------------------------------------------------------------------

// `card` cobre débito e crédito. `on_account` (fiado) não existe mais para vendas novas: só aparece em vendas antigas.
export type SalePaymentMethod = 'pix' | 'card' | 'cash' | 'on_account';
// Formas de pagamento aceitas ao registrar uma venda nova (toda venda nova já nasce paga).
export type NewSalePaymentMethod = Exclude<SalePaymentMethod, 'on_account'>;
// `cancelled`: pedido pendente cancelado pela loja (o estoque reservado voltou). Só `pending` cancela.
export type SaleStatusValue = 'paid' | 'pending' | 'cancelled';
// `online` = pedido feito pelo cliente na vitrine (sempre nasce pendente); `manual` = registrada pela loja no app.
export type SaleSource = 'manual' | 'online';

// Item gravado no momento da venda: sobrevive à remoção do produto da loja (`storeProductId` vira null).
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
  // WhatsApp do cliente (só dígitos): só os pedidos online trazem.
  customerWhatsapp: string | null;
};

// A resposta de venda não traz custo, lucro nem margem.
export type SaleDetail = SaleListItem & { items: SaleItemDetail[] };

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
// Início (GET /home)
// ---------------------------------------------------------------------------

// Toda loja começa no Gratuito. Mesmos ids do `PlanId` de src/types (usado no catálogo de exemplo
// da tela Planos), mas este aqui é o valor real que vem da API.
export type StorePlanId = 'free' | 'starter' | 'premium' | 'business';

export type LowStockProduct = {
  // UUID do produto da loja (o mesmo de ProductDetail).
  storeProductId: string;
  name: string;
  stock: number;
};

export type HomeSummary = {
  plan: { id: StorePlanId; name: string };
  revenue: {
    // Só vendas PAGAS do mês.
    total: number;
    // Variação sobre o mês anterior (também só vendas pagas). null = o mês anterior não teve vendas: sem seta.
    growthPercent: number | null;
  };
  // null = a loja ainda não escolheu a meta: o app pede para escolher.
  goal: {
    target: number;
    // 0 a 100 (a barra não passa do fim).
    percent: number;
    // 0 quando a meta foi batida.
    remaining: number;
  } | null;
  alerts: {
    lowStock: {
      // Estoque igual ou abaixo disso conta como "em baixa" (a regra é do servidor).
      threshold: number;
      // Total de produtos em baixa (inclui esgotados e os cadastrados sem estoque, que valem 0).
      count: number;
      // Os mais críticos primeiro; só alguns (o total está em `count`).
      products: LowStockProduct[];
    };
    // Vendas a receber, de qualquer mês: os pedidos da vitrine aguardando pagamento.
    pendingSales: { count: number };
  };
};

// ---------------------------------------------------------------------------
// Configurações da loja (tela Mais)
// ---------------------------------------------------------------------------

export type StoreSettings = {
  plan: { id: StorePlanId; name: string };
  // Formas de pagamento que a vitrine aceita: sempre ao menos uma, sem fiado, em ordem fixa (Pix, Cartão, Dinheiro).
  acceptedPaymentMethods: NewSalePaymentMethod[];
  // Some da vitrine o produto com estoque zerado.
  hideOutOfStock: boolean;
};

// Só o que a tela pode mudar; o plano não muda por aqui.
export type StoreSettingsChanges = Partial<Pick<StoreSettings, 'acceptedPaymentMethods' | 'hideOutOfStock'>>;

// ---------------------------------------------------------------------------
// Vitrine (tela Minha Loja)
// ---------------------------------------------------------------------------

export type StoreStats = {
  // Visitas à vitrine nos últimos 7 dias (o site registra uma por visita).
  visitsLast7Days: number;
  // Pedidos feitos pelos clientes na vitrine (de qualquer período e status).
  ordersCount: number;
};

export type CreateSaleInput = {
  clientRequestId: string;
  customerName: string;
  paymentMethod: NewSalePaymentMethod;
  // Só com `card` (1 a 24). Com outro método a API responde 400.
  installments?: number;
  items: { storeProductId: string; quantity: number }[];
};

// ---------------------------------------------------------------------------
// Relatórios (mais vendidos / parados)
// ---------------------------------------------------------------------------

export type TopProduct = {
  storeProductId: string;
  name: string;
  image: string | null;
  quantitySold: number;
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
// Notificações
// ---------------------------------------------------------------------------

export type NotificationType = 'SYSTEM' | 'STOCK_LOW' | 'GOAL' | 'PROMOTION';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  // Payload livre pra navegação (ex.: { action: 'OPEN_STOCK', storeProductId }). null = sem ação.
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};
