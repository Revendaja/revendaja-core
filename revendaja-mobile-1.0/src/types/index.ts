export type ProductCategory = 'Eletrônicos' | 'Vestuário' | 'Cosméticos' | 'Acessórios' | 'Casa';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  brand?: string;
  price: number;
  costPrice: number;
  stock: number;
  image: string;
  photoUri?: string;
  description: string;
  barcode: string;
  expiryDate?: string;
}

export interface ProductTemplate {
  id: string;
  name: string;
  category: ProductCategory;
  brand: string;
  description: string;
  image: string;
  barcode: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  city: string;
  avatarColor: string;
  totalPurchases: number;
}

export type SaleStatus = 'Pago' | 'Pendente';

export type PaymentMethod = 'pix' | 'cartao' | 'dinheiro' | 'fiado';

export type SaleSource = 'online' | 'manual';

export interface SaleItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Sale {
  id: string;
  clientId: string;
  date: string;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  installments?: number;
  items: SaleItem[];
  source: SaleSource;
}

export type PlanId = 'free' | 'starter' | 'premium' | 'business';

export interface Plan {
  id: PlanId;
  name: string;
  priceLabel: string;
  billingLabel: string;
  tagline: string;
  highlight?: boolean;
  features: string[];
}

export type SubscriptionPaymentStatus = 'Pago' | 'Falhou';

export interface SubscriptionPayment {
  id: string;
  date: string;
  planName: string;
  amount: number;
  status: SubscriptionPaymentStatus;
}
