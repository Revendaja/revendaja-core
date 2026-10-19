import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError';
import type { Paginated } from '../catalog/catalog.types';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import type { Store } from '../store/store.types';
import { salesRepository, type SalesRepository } from './sales.repository';
import type { CreateSaleInput, ListSalesQuery, SalesTimelineQuery } from './sales.schema';
import { buildSalesSummary } from './sales.summary';
import { buildSalesTimeline } from './sales.timeline';
import type {
  CreateSaleData,
  OnlineOrderInput,
  Sale,
  SaleListItem,
  SaleSource,
  SalesSummary,
  SalesTimeline,
  StaleProduct,
  TopBrand,
  TopProduct,
} from './sales.types';

type StoreLookup = Pick<StoreRepository, 'findByUserId'>;

// Cancelamento automático: quantos pedidos por lote, e quantos lotes no máximo por rodada.
const EXPIRATION_BATCH_SIZE = 100;
const MAX_EXPIRATION_ROUNDS = 50;

// "R$ 1.234,50" para mensagens de erro.
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function assertNoDuplicateItems(items: { storeProductId: string }[]): void {
  const productIds = items.map((item) => item.storeProductId);
  if (new Set(productIds).size !== productIds.length) {
    throw new AppError(
      'O mesmo produto aparece mais de uma vez na venda. Some as quantidades em um único item.',
      400,
      'DUPLICATE_SALE_ITEM',
    );
  }
}

export class SalesService {
  constructor(
    private readonly repository: SalesRepository = salesRepository,
    private readonly stores: StoreLookup = storeRepository,
  ) {}

  // `created` é false quando o `clientRequestId` já tinha uma venda (repetição do
  // app): nesse caso devolvemos a MESMA venda, sem baixar estoque de novo.
  async create(userId: string, input: CreateSaleInput): Promise<{ sale: Sale; created: boolean }> {
    const store = await this.getOwnStoreOrThrow(userId);
    assertNoDuplicateItems(input.items);

    return this.place(
      {
        storeId: store.id,
        clientRequestId: input.clientRequestId,
        customerName: input.customerName,
        customerWhatsapp: null,
        fulfillment: null,
        deliveryAddress: null,
        cashChangeFor: null,
        paymentMethod: input.paymentMethod,
        // Só o cartão tem parcelas; sem informar, é 1x.
        installments: input.paymentMethod === 'card' ? (input.installments ?? 1) : null,
        // Sem fiado: toda venda registrada pela loja já entra como paga.
        status: 'paid',
        source: 'manual',
        onlyActiveProducts: false,
        items: input.items,
      },
      'Produto não encontrado na sua loja.',
    );
  }

  // Pedido feito pelo CLIENTE na vitrine online (revendaja-web): sempre nasce PENDENTE (a loja
  // confirma o pagamento depois, com `markPaid`) e marcado como `online`. Usa a mesma transação
  // da venda da loja: numera, reserva o estoque e é idempotente por `clientRequestId`. Só vende
  // produto visível na vitrine. Quem chama já verificou que a loja existe, está online e aceita
  // a forma de pagamento.
  async createOnlineOrder(
    storeId: string,
    input: OnlineOrderInput,
  ): Promise<{ sale: Sale; created: boolean }> {
    assertNoDuplicateItems(input.items);

    return this.place(
      {
        storeId,
        clientRequestId: input.clientRequestId,
        customerName: input.customerName,
        customerWhatsapp: input.customerWhatsapp,
        fulfillment: input.fulfillment,
        // Endereço só existe na entrega; troco só na entrega paga em dinheiro (a rota já valida, aqui
        // garantimos que nada sobra gravado na retirada).
        deliveryAddress: input.fulfillment === 'delivery' ? (input.deliveryAddress ?? null) : null,
        cashChangeFor:
          input.fulfillment === 'delivery' && input.paymentMethod === 'cash'
            ? (input.cashChangeFor ?? null)
            : null,
        paymentMethod: input.paymentMethod,
        installments: input.paymentMethod === 'card' ? (input.installments ?? 1) : null,
        status: 'pending',
        source: 'online',
        onlyActiveProducts: true,
        items: input.items,
      },
      'Um dos produtos não está mais disponível nesta loja.',
    );
  }

  async list(userId: string, query: ListSalesQuery): Promise<Paginated<SaleListItem>> {
    const store = await this.getOwnStoreOrThrow(userId);
    const { items, total } = await this.repository.list(store.id, query);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(userId: string, saleId: string): Promise<Sale> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.getSaleOrThrow(store.id, saleId);
  }

  // Idempotente: marcar como paga uma venda já paga devolve a venda, sem erro. Venda cancelada
  // não vira paga (409): o estoque dela já voltou.
  async markPaid(userId: string, saleId: string): Promise<Sale> {
    const store = await this.getOwnStoreOrThrow(userId);
    const sale = await this.repository.markPaid(store.id, saleId);
    if (!sale) {
      throw new NotFoundError('Venda não encontrada.');
    }
    if (sale.status === 'cancelled') {
      throw new ConflictError('Esta venda foi cancelada e não pode ser marcada como paga.');
    }
    return sale;
  }

  // Cancela os pedidos da vitrine que ficaram PENDENTES desde antes de `cutoff` (ninguém pagou) e
  // devolve o estoque que reservavam. Usa o mesmo cancelamento da loja (`repository.cancel`), então é
  // seguro rodar em várias instâncias ao mesmo tempo e contra o pagamento: se a loja marcou o pedido
  // como pago no meio do caminho, o UPDATE (que só casa `pending`) não o cancela. Devolve quantos
  // pedidos foram cancelados AGORA.
  async expireStaleOnlineOrders(cutoff: Date): Promise<number> {
    let cancelled = 0;

    for (let round = 0; round < MAX_EXPIRATION_ROUNDS; round += 1) {
      const batch = await this.repository.findExpiredOnlineOrders(cutoff, EXPIRATION_BATCH_SIZE);

      for (const { id, storeId } of batch) {
        const result = await this.repository.cancel(storeId, id);
        if (result.kind === 'cancelled') cancelled += 1;
      }

      // Lote incompleto = acabaram. (Quem não cancelou, já não está mais pendente e sai da busca.)
      if (batch.length < EXPIRATION_BATCH_SIZE) break;
    }

    return cancelled;
  }

  // Cancela um pedido pendente e devolve o estoque reservado. Idempotente: cancelar de novo devolve
  // a venda (sem devolver o estoque outra vez). Venda paga não cancela (409).
  async cancel(userId: string, saleId: string): Promise<Sale> {
    const store = await this.getOwnStoreOrThrow(userId);
    const result = await this.repository.cancel(store.id, saleId);

    switch (result.kind) {
      case 'cancelled':
      case 'already_cancelled':
        return result.sale;
      case 'paid':
        throw new ConflictError('Uma venda já paga não pode ser cancelada.');
      case 'not_found':
        throw new NotFoundError('Venda não encontrada.');
    }
  }

  // As definições (faturamento, lucro, margem) ficam em `buildSalesSummary`.
  async summary(userId: string, from: Date, to: Date, source?: SaleSource): Promise<SalesSummary> {
    const store = await this.getOwnStoreOrThrow(userId);
    const data = await this.repository.summaryData(store.id, from, to, source);
    return buildSalesSummary(data);
  }

  // Receita (vendas pagas) e custo por dia/semana/mês, com os períodos vazios preenchidos com zero.
  async timeline(userId: string, query: SalesTimelineQuery): Promise<SalesTimeline> {
    const store = await this.getOwnStoreOrThrow(userId);
    const sales = await this.repository.timelineSales(store.id, query.from, query.to);
    return buildSalesTimeline({ sales, ...query });
  }

  async topProducts(userId: string, from: Date, to: Date, limit: number): Promise<TopProduct[]> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.repository.topProducts(store.id, from, to, limit);
  }

  async topBrands(userId: string, from: Date, to: Date, limit: number): Promise<TopBrand[]> {
    const store = await this.getOwnStoreOrThrow(userId);
    return this.repository.topBrands(store.id, from, to, limit);
  }

  async staleProducts(userId: string, days: number, limit: number): Promise<StaleProduct[]> {
    const store = await this.getOwnStoreOrThrow(userId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.repository.staleProducts(store.id, cutoff, limit);
  }

  private async place(
    data: CreateSaleData,
    productNotFoundMessage: string,
  ): Promise<{ sale: Sale; created: boolean }> {
    const result = await this.repository.createSale(data);

    switch (result.kind) {
      case 'created':
        return { sale: result.sale, created: true };
      case 'duplicate':
        return { sale: result.sale, created: false };
      case 'product_not_found':
        throw new NotFoundError(productNotFoundMessage);
      case 'insufficient_stock':
        throw new ConflictError(
          `Estoque insuficiente para "${result.productName}": disponível ${result.available}.`,
        );
      case 'total_too_large':
        throw new AppError('O total da venda é grande demais.', 400, 'SALE_TOTAL_TOO_LARGE');
      case 'change_too_low':
        throw new AppError(
          `O troco precisa ser para um valor igual ou maior que o total do pedido (${formatBRL(result.total)}).`,
          400,
          'CHANGE_TOO_LOW',
        );
    }
  }

  private async getSaleOrThrow(storeId: string, saleId: string): Promise<Sale> {
    const sale = await this.repository.findById(storeId, saleId);
    if (!sale) {
      throw new NotFoundError('Venda não encontrada.');
    }
    return sale;
  }

  private async getOwnStoreOrThrow(userId: string): Promise<Store> {
    const store = await this.stores.findByUserId(userId);
    if (!store) {
      throw new NotFoundError('Você ainda não possui uma loja.');
    }
    return store;
  }
}

export const salesService = new SalesService();
