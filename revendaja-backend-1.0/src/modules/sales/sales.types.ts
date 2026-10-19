export type PaymentMethod = 'pix' | 'card' | 'cash' | 'on_account';
// `cancelled`: pedido pendente cancelado pela loja (o estoque reservado voltou). Só `pending` cancela.
export type SaleStatus = 'paid' | 'pending' | 'cancelled';
// Registrada pela própria loja no app, ou feita pelo cliente na vitrine online (revendaja-web).
export type SaleSource = 'manual' | 'online';
// Como o cliente recebe o pedido da vitrine: busca na loja ou a loja entrega.
export type FulfillmentMethod = 'pickup' | 'delivery';

// Linha de listagem: sem os itens.
export interface SaleListItem {
  id: string;
  number: number;
  createdAt: Date;
  status: SaleStatus;
  source: SaleSource;
  paymentMethod: PaymentMethod;
  installments: number | null;
  total: number;
  customerName: string;
  // Só os pedidos online trazem o WhatsApp do cliente (só dígitos).
  customerWhatsapp: string | null;
  // Só o pedido online informa (retirada ou entrega). null = venda registrada pela própria loja.
  fulfillment: FulfillmentMethod | null;
}

// Item como aparece no detalhe. NÃO inclui custo: o detalhe mostra só o total
// da venda (custo/lucro por venda não são expostos).
export interface SaleItem {
  storeProductId: string | null;
  productName: string;
  productImageSm: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Sale extends SaleListItem {
  items: SaleItem[];
  // Só com `fulfillment = delivery`.
  deliveryAddress: string | null;
  // Entrega paga em dinheiro: "troco para quanto". null = não precisa de troco.
  cashChangeFor: number | null;
}

export interface CreateSaleData {
  storeId: string;
  clientRequestId: string;
  customerName: string;
  customerWhatsapp: string | null;
  fulfillment: FulfillmentMethod | null;
  deliveryAddress: string | null;
  cashChangeFor: number | null;
  paymentMethod: PaymentMethod;
  installments: number | null;
  status: SaleStatus;
  source: SaleSource;
  // true = só vende produto visível na vitrine (`isActive`). Pedido online exige; a venda feita pela loja não.
  onlyActiveProducts: boolean;
  items: { storeProductId: string; quantity: number }[];
}

// Pedido feito pelo cliente na vitrine online (já validado pela rota pública).
export interface OnlineOrderInput {
  clientRequestId: string;
  customerName: string;
  customerWhatsapp: string;
  fulfillment: FulfillmentMethod;
  // Obrigatório na entrega; ignorado na retirada.
  deliveryAddress?: string | null;
  // Só entrega paga em dinheiro: troco para quanto.
  cashChangeFor?: number | null;
  paymentMethod: 'pix' | 'card' | 'cash';
  installments?: number | null;
  items: { storeProductId: string; quantity: number }[];
}

// Resultado do cancelamento (tipado porque quem decide o erro HTTP é o service).
export type CancelSaleResult =
  | { kind: 'cancelled'; sale: Sale }
  // A venda já estava cancelada: nada mudou (e o estoque NÃO voltou de novo).
  | { kind: 'already_cancelled'; sale: Sale }
  // Venda paga não cancela.
  | { kind: 'paid'; sale: Sale }
  | { kind: 'not_found' };

// Resultado tipado (e não exceções) porque quem decide o erro HTTP é o service.
export type CreateSaleResult =
  | { kind: 'created'; sale: Sale }
  | { kind: 'duplicate'; sale: Sale }
  | { kind: 'product_not_found' }
  | { kind: 'insufficient_stock'; productName: string; available: number }
  | { kind: 'total_too_large' }
  // O troco pedido é menor que o total do pedido (o total só é conhecido ao gravar).
  | { kind: 'change_too_low'; total: number };

export interface SummaryItemRow {
  unitPriceCents: number;
  unitCostCents: number | null;
  quantity: number;
}

// Soma do total das vendas do período por status, em centavos.
export interface PeriodTotals {
  paidCents: number;
  pendingCents: number;
}

// Dados crus do período; as contas (lucro, margem) ficam em `buildSalesSummary`.
export interface SummaryData extends PeriodTotals {
  paidItems: SummaryItemRow[];
}

export interface SalesSummary {
  grossRevenue: number;
  pendingTotal: number;
  profit: number | null;
  marginPercent: number | null;
  profitIsPartial: boolean;
}

export interface TopProduct {
  storeProductId: string;
  name: string;
  image: string | null;
  quantitySold: number;
  revenue: number;
}

export interface TopBrand {
  brandId: number;
  name: string;
  logo: string | null;
  quantitySold: number;
  revenue: number;
}

export interface StaleProduct {
  storeProductId: string;
  name: string;
  image: string | null;
  stock: number;
  price: number;
  lastSoldAt: Date | null;
}

export type TimelineGroupBy = 'day' | 'week' | 'month';

// Venda PAGA do período, com o custo (em centavos) dos itens que têm custo; `hasUncostedItem` marca
// que algum item pago ficou sem custo.
export interface TimelineSaleRow {
  createdAt: Date;
  totalCents: number;
  costCents: number;
  hasUncostedItem: boolean;
}

export interface TimelinePoint {
  // Início do dia/semana/mês (no fuso pedido), como instante UTC.
  periodStart: Date;
  revenue: number;
  cost: number;
}

export interface SalesTimeline {
  groupBy: TimelineGroupBy;
  // true se existe item pago sem custo (o `cost` ignora esses itens).
  costIsPartial: boolean;
  items: TimelinePoint[];
}
