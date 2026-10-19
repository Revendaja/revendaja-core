import type { Paginated } from '../catalog/catalog.types';
import type { FulfillmentMethod, PaymentMethod, SaleStatus } from '../sales/sales.types';
import type { AcceptedPaymentMethod } from '../store/store.types';
import type { StorefrontConfig, StorefrontSection } from './storefront.config';

// Produto como o cliente vê na vitrine. Não traz custo, estoque exato nem dados do catálogo interno.
export interface StorefrontProduct {
  // Id do produto DA LOJA: é o que o pedido (`POST /public/stores/:handle/orders`) recebe.
  id: string;
  name: string;
  description: string | null;
  brand: string;
  image: string | null;
  imageSm: string | null;
  price: number;
  // Preço promocional ainda válido. null quando não há promoção ativa (mesmo que o produto já tenha
  // tido uma no passado) — o cliente nunca vê uma promoção vencida.
  promoPrice: number | null;
  isPromoActive: boolean;
  inStock: boolean;
  // Cadastrado há pouco tempo (selo "Novo" na vitrine).
  isNew: boolean;
}

export interface Storefront {
  store: {
    storeName: string;
    handle: string;
    // Descrição da loja (topo da vitrine). null = não escreveu.
    bio: string | null;
    acceptedPaymentMethods: AcceptedPaymentMethod[];
  };
  products: Paginated<StorefrontProduct>;
}

// Comprovante do pedido para o cliente: número, total e o que foi pedido. Sem ids internos.
export interface OnlineOrderReceipt {
  number: number;
  status: SaleStatus;
  total: number;
  paymentMethod: PaymentMethod;
  installments: number | null;
  customerName: string;
  fulfillment: FulfillmentMethod;
  // Só na entrega.
  deliveryAddress: string | null;
  // Só entrega paga em dinheiro: troco para quanto. null = não precisa de troco.
  cashChangeFor: number | null;
  createdAt: Date;
  // Até quando o pedido espera o pagamento: depois disso é cancelado sozinho e o estoque volta.
  expiresAt: Date;
  items: { productName: string; quantity: number; unitPrice: number; subtotal: number }[];
}

// Números da tela Minha Loja.
export interface StoreStats {
  visitsLast7Days: number;
  // Pedidos feitos pelos clientes na vitrine (todos, de qualquer período e status).
  ordersCount: number;
}

// Atalho de categoria da vitrine: nasce do que a loja vende. `category` = categoria própria da loja;
// `brand` = marca dos produtos do catálogo.
export interface StorefrontCategory {
  type: 'category' | 'brand';
  id: string;
  name: string;
  // Quantos produtos visíveis (em estoque, se a loja esconde os esgotados) tem nela.
  count: number;
  // Foto de um dos produtos dela, para o atalho.
  image: string | null;
}

// Página inicial da vitrine: o que vem pronto (banners/textos, padrão ou personalizado) e as seções
// montadas com o estoque da loja.
export interface StorefrontHome {
  store: {
    storeName: string;
    handle: string;
    bio: string | null;
    acceptedPaymentMethods: AcceptedPaymentMethod[];
    // Planos Pro e Empresarial tiram a marca do Revendajá do rodapé.
    hideBranding: boolean;
  };
  config: StorefrontConfig;
  categories: StorefrontCategory[];
  // Mais vendidos nos últimos 90 dias; completa com os mais novos se ainda não há vendas.
  featured: StorefrontProduct[];
  // Produtos em promoção que ainda valem; `endsAt` = quando acaba a primeira (contagem regressiva).
  offers: { products: StorefrontProduct[]; endsAt: Date | null };
  newArrivals: StorefrontProduct[];
}

// O que o painel edita: o resultado já resolvido, os padrões (para mostrar e restaurar) e quais
// seções a loja personalizou.
export interface StorefrontCustomization {
  config: StorefrontConfig;
  defaults: StorefrontConfig;
  customized: Record<StorefrontSection, boolean>;
}
