import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CatalogProduct } from '../api/types';

export type HomeStackParamList = {
  HomeHome: undefined;
};

export type EstoqueStackParamList = {
  // "Meus produtos" da loja (GET /store/products).
  CatalogList: undefined;
  // `storeProductId` é o UUID do produto da loja (não o id numérico do catálogo).
  ProductDetail: { storeProductId: string };
  // Navegar no catálogo global para adicionar produtos à loja.
  NewProduct: undefined;
  // Adicionar um produto do catálogo com preço, ou editar o produto da loja.
  ProductForm: { catalogProduct: CatalogProduct } | { storeProductId: string };
  // Cadastrar um produto próprio (fora do catálogo) ou editar um já existente. undefined = criar.
  ManualProductForm: { storeProductId: string } | undefined;
};

export type FinancasStackParamList = {
  SalesList: undefined;
  SaleDetail: { saleId: string };
  Reports: undefined;
};

export type MoreStackParamList = {
  MoreHome: undefined;
  Account: undefined;
  Plans: undefined;
  Subscription: undefined;
  StoreHome: undefined;
  EditStore: undefined;
  OnlineSales: undefined;
  // Detalhe de uma venda real (o mesmo de Finanças), aberto a partir de Vendas Recentes.
  SaleDetail: { saleId: string };
  ClientDetail: { clientId: string };
};

export type RootTabParamList = {
  Home: undefined;
  EstoqueStack: undefined;
  NovaVenda: undefined;
  FinancasStack: undefined;
  // Aceita `{ screen: 'OnlineSales' }` etc. pra abrir uma tela específica da aba a partir da Início
  // (ex.: os atalhos de "Ações Rápidas").
  MoreStack: NavigatorScreenParams<MoreStackParamList> | undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  // Só para quem entrou pela primeira vez com o Google e ainda não informou o WhatsApp.
  CompleteProfile: undefined;
  VerifyOtp: undefined;
  CreateStore: undefined;
  // Aceita `{ screen: 'EstoqueStack' }` etc. pra navegar direto numa aba a partir de uma tela fora
  // das abas (ex.: Notificações mandando pro Estoque quando toca num alerta de estoque baixo).
  Main: NavigatorScreenParams<RootTabParamList> | undefined;
  // Fora das abas de propósito: abre "por cima" de tudo (inclusive da navbar) e não fica "presa"
  // numa aba — trocar de aba e voltar pra Início não deve reabrir Notificações sozinha.
  Notifications: undefined;
};
