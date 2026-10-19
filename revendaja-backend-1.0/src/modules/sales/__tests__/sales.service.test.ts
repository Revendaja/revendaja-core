import { SalesService } from '../sales.service';
import type { SalesRepository } from '../sales.repository';
import type { CreateSaleInput } from '../sales.schema';
import type { Sale, SummaryData } from '../sales.types';
import type { Store } from '../../store/store.types';
import { AppError, ConflictError, NotFoundError } from '../../../shared/errors/AppError';

function createRepositoryMock(): jest.Mocked<SalesRepository> {
  return {
    findById: jest.fn(),
    findByClientRequestId: jest.fn(),
    list: jest.fn(),
    createSale: jest.fn(),
    markPaid: jest.fn(),
    periodTotals: jest.fn(),
    countPending: jest.fn(),
    countBySource: jest.fn(),
    cancel: jest.fn(),
    findExpiredOnlineOrders: jest.fn(),
    summaryData: jest.fn(),
    topProducts: jest.fn(),
    staleProducts: jest.fn(),
    timelineSales: jest.fn(),
    topBrands: jest.fn(),
  };
}

function buildStore(): Store {
  return {
    id: 'store-1',
    userId: 'user-1',
    storeName: 'Leal Perfumaria',
    handle: 'lealperfumaria',
    catalogLink: 'https://lealperfumaria.revendaja.com',
    isOnline: true,
    bio: null,
    plan: 'free',
    defaultMinStock: 0,
    createdAt: new Date(),
  };
}

function buildSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: 1,
    createdAt: new Date(),
    status: 'paid',
    source: 'manual',
    paymentMethod: 'pix',
    installments: null,
    total: 100,
    customerName: 'Ana Souza',
    customerWhatsapp: null,
    fulfillment: null,
    deliveryAddress: null,
    cashChangeFor: null,
    items: [],
    ...overrides,
  };
}

const PRODUCT_A = '22222222-2222-4222-8222-222222222222';
const PRODUCT_B = '33333333-3333-4333-8333-333333333333';

function buildInput(overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    clientRequestId: '44444444-4444-4444-8444-444444444444',
    customerName: 'Ana Souza',
    paymentMethod: 'pix',
    items: [{ storeProductId: PRODUCT_A, quantity: 2 }],
    ...overrides,
  };
}

function build() {
  const repository = createRepositoryMock();
  const stores = { findByUserId: jest.fn().mockResolvedValue(buildStore()) };
  const service = new SalesService(repository, stores);
  return { repository, stores, service };
}

describe('SalesService', () => {
  describe('create', () => {
    it('lança NotFoundError quando a usuária não tem loja', async () => {
      const { stores, service } = build();
      stores.findByUserId.mockResolvedValue(null);

      await expect(service.create('user-1', buildInput())).rejects.toBeInstanceOf(NotFoundError);
    });

    it('recusa o mesmo produto duas vezes na venda (400 DUPLICATE_SALE_ITEM)', async () => {
      const { repository, service } = build();

      const error = await service
        .create(
          'user-1',
          buildInput({
            items: [
              { storeProductId: PRODUCT_A, quantity: 1 },
              { storeProductId: PRODUCT_A, quantity: 2 },
            ],
          }),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('DUPLICATE_SALE_ITEM');
      expect((error as AppError).statusCode).toBe(400);
      expect(repository.createSale).not.toHaveBeenCalled();
    });

    it.each([
      ['pix', undefined, 'paid', null],
      ['cash', undefined, 'paid', null],
      ['card', undefined, 'paid', 1],
      ['card', 3, 'paid', 3],
    ] as const)(
      '%s (parcelas %s) grava status %s e installments %s',
      async (paymentMethod, installments, status, expectedInstallments) => {
        const { repository, service } = build();
        repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

        await service.create('user-1', buildInput({ paymentMethod, installments }));

        const data = repository.createSale.mock.calls[0][0];
        expect(data.status).toBe(status);
        expect(data.installments).toBe(expectedInstallments);
        expect(data.storeId).toBe('store-1');
      },
    );

    it('repassa cliente, itens e clientRequestId para o repositório', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });
      const input = buildInput({
        items: [
          { storeProductId: PRODUCT_A, quantity: 2 },
          { storeProductId: PRODUCT_B, quantity: 1 },
        ],
      });

      await service.create('user-1', input);

      expect(repository.createSale).toHaveBeenCalledWith(
        expect.objectContaining({
          clientRequestId: input.clientRequestId,
          customerName: 'Ana Souza',
          items: input.items,
        }),
      );
    });

    it('venda nova: created = true', async () => {
      const { repository, service } = build();
      const sale = buildSale();
      repository.createSale.mockResolvedValue({ kind: 'created', sale });

      await expect(service.create('user-1', buildInput())).resolves.toEqual({
        sale,
        created: true,
      });
    });

    it('clientRequestId repetido: devolve a MESMA venda com created = false', async () => {
      const { repository, service } = build();
      const sale = buildSale({ number: 7 });
      repository.createSale.mockResolvedValue({ kind: 'duplicate', sale });

      await expect(service.create('user-1', buildInput())).resolves.toEqual({
        sale,
        created: false,
      });
    });

    it('produto que não é da loja: 404', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'product_not_found' });

      const error = await service.create('user-1', buildInput()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as Error).message).toBe('Produto não encontrado na sua loja.');
    });

    it('estoque insuficiente: 409 dizendo qual produto e quanto há disponível', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({
        kind: 'insufficient_stock',
        productName: 'Kaiak Aventura 100 ml',
        available: 1,
      });

      const error = await service.create('user-1', buildInput()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toBe(
        'Estoque insuficiente para "Kaiak Aventura 100 ml": disponível 1.',
      );
    });

    it('total grande demais: 400 SALE_TOTAL_TOO_LARGE', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'total_too_large' });

      const error = await service.create('user-1', buildInput()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('SALE_TOTAL_TOO_LARGE');
    });
  });

  describe('create: venda registrada pela loja', () => {
    it('nasce paga, marcada como manual, sem WhatsApp e podendo vender produto oculto na vitrine', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

      await service.create('user-1', buildInput());

      expect(repository.createSale.mock.calls[0][0]).toMatchObject({
        status: 'paid',
        source: 'manual',
        customerWhatsapp: null,
        onlyActiveProducts: false,
      });
    });
  });

  describe('createOnlineOrder (pedido do cliente na vitrine)', () => {
    function buildOnlineInput(overrides: Record<string, unknown> = {}) {
      return {
        clientRequestId: '44444444-4444-4444-8444-444444444444',
        customerName: 'Bia Lima',
        customerWhatsapp: '5511987654321',
        fulfillment: 'pickup' as const,
        paymentMethod: 'pix' as const,
        items: [{ storeProductId: PRODUCT_A, quantity: 2 }],
        ...overrides,
      };
    }

    it('sempre nasce PENDENTE, marcado como online, com o WhatsApp do cliente, na loja informada', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

      await service.createOnlineOrder('store-9', buildOnlineInput());

      expect(repository.createSale.mock.calls[0][0]).toMatchObject({
        storeId: 'store-9',
        status: 'pending',
        source: 'online',
        customerName: 'Bia Lima',
        customerWhatsapp: '5511987654321',
      });
    });

    it('entrega: grava endereço e, em dinheiro, o troco', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

      await service.createOnlineOrder(
        'store-1',
        buildOnlineInput({
          paymentMethod: 'cash',
          fulfillment: 'delivery',
          deliveryAddress: 'Rua das Flores, 100, Centro',
          cashChangeFor: 200,
        }),
      );

      expect(repository.createSale.mock.calls[0][0]).toMatchObject({
        fulfillment: 'delivery',
        deliveryAddress: 'Rua das Flores, 100, Centro',
        cashChangeFor: 200,
      });
    });

    it('retirada: não grava endereço nem troco, mesmo que venham no input', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

      await service.createOnlineOrder(
        'store-1',
        buildOnlineInput({
          paymentMethod: 'cash',
          fulfillment: 'pickup',
          deliveryAddress: 'Rua das Flores, 100, Centro',
          cashChangeFor: 200,
        }),
      );

      expect(repository.createSale.mock.calls[0][0]).toMatchObject({
        fulfillment: 'pickup',
        deliveryAddress: null,
        cashChangeFor: null,
      });
    });

    it('entrega paga no Pix: não grava troco', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

      await service.createOnlineOrder(
        'store-1',
        buildOnlineInput({
          paymentMethod: 'pix',
          fulfillment: 'delivery',
          deliveryAddress: 'Rua das Flores, 100, Centro',
          cashChangeFor: 200,
        }),
      );

      expect(repository.createSale.mock.calls[0][0]).toMatchObject({ cashChangeFor: null });
    });

    it('troco menor que o total vira 400 CHANGE_TOO_LOW', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'change_too_low', total: 110 });

      await expect(
        service.createOnlineOrder(
          'store-1',
          buildOnlineInput({
            paymentMethod: 'cash',
            fulfillment: 'delivery',
            deliveryAddress: 'Rua das Flores, 100, Centro',
            cashChangeFor: 100,
          }),
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'CHANGE_TOO_LOW' });
    });

    it('só vende produto visível na vitrine (onlyActiveProducts)', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

      await service.createOnlineOrder('store-1', buildOnlineInput());

      expect(repository.createSale.mock.calls[0][0].onlyActiveProducts).toBe(true);
    });

    it('não consulta a loja da usuária (a rota pública já resolveu a loja)', async () => {
      const { stores, repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

      await service.createOnlineOrder('store-1', buildOnlineInput());

      expect(stores.findByUserId).not.toHaveBeenCalled();
    });

    it.each([
      ['pix', undefined, null],
      ['cash', undefined, null],
      ['card', undefined, 1],
      ['card', 6, 6],
    ] as const)(
      '%s (parcelas %s) grava installments %s',
      async (paymentMethod, installments, expected) => {
        const { repository, service } = build();
        repository.createSale.mockResolvedValue({ kind: 'created', sale: buildSale() });

        await service.createOnlineOrder(
          'store-1',
          buildOnlineInput({ paymentMethod, installments }),
        );

        expect(repository.createSale.mock.calls[0][0].installments).toBe(expected);
      },
    );

    it('recusa o mesmo produto duas vezes (400 DUPLICATE_SALE_ITEM)', async () => {
      const { repository, service } = build();

      const error = await service
        .createOnlineOrder(
          'store-1',
          buildOnlineInput({
            items: [
              { storeProductId: PRODUCT_A, quantity: 1 },
              { storeProductId: PRODUCT_A, quantity: 1 },
            ],
          }),
        )
        .catch((e: unknown) => e);

      expect((error as AppError).code).toBe('DUPLICATE_SALE_ITEM');
      expect(repository.createSale).not.toHaveBeenCalled();
    });

    it('produto que não está (mais) na vitrine: 404 com mensagem para o cliente', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({ kind: 'product_not_found' });

      const error = await service
        .createOnlineOrder('store-1', buildOnlineInput())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as Error).message).toBe('Um dos produtos não está mais disponível nesta loja.');
    });

    it('estoque insuficiente: 409 com o produto e o que há disponível', async () => {
      const { repository, service } = build();
      repository.createSale.mockResolvedValue({
        kind: 'insufficient_stock',
        productName: 'Kaiak',
        available: 1,
      });

      const error = await service
        .createOnlineOrder('store-1', buildOnlineInput())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toBe('Estoque insuficiente para "Kaiak": disponível 1.');
    });

    it('mesmo clientRequestId: devolve o MESMO pedido com created = false', async () => {
      const { repository, service } = build();
      const sale = buildSale({ number: 3, status: 'pending', source: 'online' });
      repository.createSale.mockResolvedValue({ kind: 'duplicate', sale });

      await expect(service.createOnlineOrder('store-1', buildOnlineInput())).resolves.toEqual({
        sale,
        created: false,
      });
    });
  });

  describe('expireStaleOnlineOrders (cancelamento automático)', () => {
    const CUTOFF = new Date('2026-09-22T15:00:00.000Z');
    const stale = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `sale-${i}`, storeId: `store-${i % 3}` }));

    it('sem pedido esquecido: não cancela nada', async () => {
      const { repository, service } = build();
      repository.findExpiredOnlineOrders.mockResolvedValue([]);

      await expect(service.expireStaleOnlineOrders(CUTOFF)).resolves.toBe(0);
      expect(repository.cancel).not.toHaveBeenCalled();
    });

    it('busca a partir do corte informado e cancela cada pedido na sua loja', async () => {
      const { repository, service } = build();
      repository.findExpiredOnlineOrders.mockResolvedValue([
        { id: 'sale-a', storeId: 'store-1' },
        { id: 'sale-b', storeId: 'store-2' },
      ]);
      repository.cancel.mockResolvedValue({ kind: 'cancelled', sale: buildSale() });

      const cancelled = await service.expireStaleOnlineOrders(CUTOFF);

      expect(cancelled).toBe(2);
      expect(repository.findExpiredOnlineOrders).toHaveBeenCalledWith(CUTOFF, 100);
      expect(repository.cancel).toHaveBeenCalledWith('store-1', 'sale-a');
      expect(repository.cancel).toHaveBeenCalledWith('store-2', 'sale-b');
    });

    it('só conta os que ele cancelou AGORA (a loja pode ter recebido ou cancelado no meio do caminho)', async () => {
      const { repository, service } = build();
      repository.findExpiredOnlineOrders.mockResolvedValue(stale(3));
      repository.cancel
        .mockResolvedValueOnce({ kind: 'cancelled', sale: buildSale() })
        .mockResolvedValueOnce({ kind: 'paid', sale: buildSale({ status: 'paid' }) })
        .mockResolvedValueOnce({ kind: 'already_cancelled', sale: buildSale() });

      await expect(service.expireStaleOnlineOrders(CUTOFF)).resolves.toBe(1);
    });

    it('lote cheio: busca o próximo até acabar', async () => {
      const { repository, service } = build();
      repository.findExpiredOnlineOrders
        .mockResolvedValueOnce(stale(100))
        .mockResolvedValueOnce(stale(40));
      repository.cancel.mockResolvedValue({ kind: 'cancelled', sale: buildSale() });

      const cancelled = await service.expireStaleOnlineOrders(CUTOFF);

      expect(cancelled).toBe(140);
      expect(repository.findExpiredOnlineOrders).toHaveBeenCalledTimes(2);
    });

    it('lote incompleto: para na hora (não faz uma busca a mais)', async () => {
      const { repository, service } = build();
      repository.findExpiredOnlineOrders.mockResolvedValue(stale(99));
      repository.cancel.mockResolvedValue({ kind: 'cancelled', sale: buildSale() });

      await service.expireStaleOnlineOrders(CUTOFF);

      expect(repository.findExpiredOnlineOrders).toHaveBeenCalledTimes(1);
    });

    it('trava de segurança: no máximo 50 lotes por rodada', async () => {
      const { repository, service } = build();
      repository.findExpiredOnlineOrders.mockResolvedValue(stale(100));
      repository.cancel.mockResolvedValue({ kind: 'cancelled', sale: buildSale() });

      const cancelled = await service.expireStaleOnlineOrders(CUTOFF);

      expect(repository.findExpiredOnlineOrders).toHaveBeenCalledTimes(50);
      expect(cancelled).toBe(5000);
    });

    it('erro do banco propaga (o job só loga e tenta na próxima rodada)', async () => {
      const { repository, service } = build();
      repository.findExpiredOnlineOrders.mockRejectedValue(new Error('banco fora do ar'));

      await expect(service.expireStaleOnlineOrders(CUTOFF)).rejects.toThrow('banco fora do ar');
    });
  });

  describe('cancel', () => {
    it('lança NotFoundError quando a usuária não tem loja', async () => {
      const { stores, repository, service } = build();
      stores.findByUserId.mockResolvedValue(null);

      await expect(service.cancel('user-1', 'sale-x')).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.cancel).not.toHaveBeenCalled();
    });

    it('cancela na loja da usuária e devolve a venda cancelada', async () => {
      const { repository, service } = build();
      const sale = buildSale({ status: 'cancelled' });
      repository.cancel.mockResolvedValue({ kind: 'cancelled', sale });

      await expect(service.cancel('user-1', sale.id)).resolves.toBe(sale);
      expect(repository.cancel).toHaveBeenCalledWith('store-1', sale.id);
    });

    it('é idempotente: cancelar de novo devolve a venda, sem erro', async () => {
      const { repository, service } = build();
      const sale = buildSale({ status: 'cancelled' });
      repository.cancel.mockResolvedValue({ kind: 'already_cancelled', sale });

      await expect(service.cancel('user-1', sale.id)).resolves.toBe(sale);
    });

    it('venda já paga não cancela: 409', async () => {
      const { repository, service } = build();
      repository.cancel.mockResolvedValue({ kind: 'paid', sale: buildSale({ status: 'paid' }) });

      const error = await service.cancel('user-1', 'sale-x').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toBe('Uma venda já paga não pode ser cancelada.');
    });

    it('venda que não existe nesta loja: 404', async () => {
      const { repository, service } = build();
      repository.cancel.mockResolvedValue({ kind: 'not_found' });

      await expect(service.cancel('user-1', 'sale-x')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('markPaid em venda cancelada: 409 (o estoque dela já voltou)', async () => {
      const { repository, service } = build();
      repository.markPaid.mockResolvedValue(buildSale({ status: 'cancelled' }));

      const error = await service.markPaid('user-1', 'sale-x').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toBe(
        'Esta venda foi cancelada e não pode ser marcada como paga.',
      );
    });
  });

  describe('list / get / markPaid', () => {
    it('list devolve a página no formato paginado', async () => {
      const { repository, service } = build();
      repository.list.mockResolvedValue({ items: [], total: 0 });

      const result = await service.list('user-1', { page: 2, pageSize: 10 });

      expect(repository.list).toHaveBeenCalledWith('store-1', { page: 2, pageSize: 10 });
      expect(result).toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
    });

    it('get: 404 quando a venda não existe nesta loja', async () => {
      const { repository, service } = build();
      repository.findById.mockResolvedValue(null);

      await expect(service.get('user-1', 'sale-x')).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.findById).toHaveBeenCalledWith('store-1', 'sale-x');
    });

    it('markPaid: 404 quando a venda não existe', async () => {
      const { repository, service } = build();
      repository.markPaid.mockResolvedValue(null);

      await expect(service.markPaid('user-1', 'sale-x')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('markPaid: devolve a venda (também quando já estava paga)', async () => {
      const { repository, service } = build();
      const sale = buildSale({ status: 'paid' });
      repository.markPaid.mockResolvedValue(sale);

      await expect(service.markPaid('user-1', sale.id)).resolves.toBe(sale);
    });
  });

  describe('summary', () => {
    const FROM = new Date('2026-09-01T03:00:00.000Z');
    const TO = new Date('2026-10-01T03:00:00.000Z');

    async function summarize(data: Partial<SummaryData>) {
      const { repository, service } = build();
      repository.summaryData.mockResolvedValue({
        paidCents: 0,
        pendingCents: 0,
        paidItems: [],
        ...data,
      });
      const result = await service.summary('user-1', FROM, TO);
      return { result, repository };
    }

    it('consulta o período informado, na loja da usuária', async () => {
      const { repository } = await summarize({});

      expect(repository.summaryData).toHaveBeenCalledWith('store-1', FROM, TO, undefined);
    });

    it('sem vendas: zeros, lucro e margem null, sem aviso de parcial', async () => {
      const { result } = await summarize({});

      expect(result).toEqual({
        grossRevenue: 0,
        pendingTotal: 0,
        profit: null,
        marginPercent: null,
        profitIsPartial: false,
      });
    });

    it('faturamento soma pagas + pendentes; a receber é só o das pendentes', async () => {
      const { result } = await summarize({ paidCents: 30000, pendingCents: 12550 });

      expect(result.grossRevenue).toBe(425.5);
      expect(result.pendingTotal).toBe(125.5);
    });

    it('lucro e margem: (preço - custo) * qtd sobre o que foi vendido com custo', async () => {
      // 2 x (100 - 60) + 1 x (50 - 20) = 80 + 30 = 110 de lucro; receita 250 -> 44%
      const { result } = await summarize({
        paidCents: 25000,
        paidItems: [
          { unitPriceCents: 10000, unitCostCents: 6000, quantity: 2 },
          { unitPriceCents: 5000, unitCostCents: 2000, quantity: 1 },
        ],
      });

      expect(result.profit).toBe(110);
      expect(result.marginPercent).toBe(44);
      expect(result.profitIsPartial).toBe(false);
    });

    it('item pago SEM custo é ignorado no lucro e liga profitIsPartial', async () => {
      const { result } = await summarize({
        paidCents: 30000,
        paidItems: [
          { unitPriceCents: 10000, unitCostCents: 6000, quantity: 1 }, // lucro 40, receita 100
          { unitPriceCents: 20000, unitCostCents: null, quantity: 1 }, // sem custo
        ],
      });

      expect(result.profit).toBe(40);
      // A margem usa só a receita dos itens COM custo (100), não os 300 vendidos.
      expect(result.marginPercent).toBe(40);
      expect(result.profitIsPartial).toBe(true);
    });

    it('nenhum item pago com custo: lucro e margem null, mas parcial = true', async () => {
      const { result } = await summarize({
        paidCents: 20000,
        paidItems: [{ unitPriceCents: 20000, unitCostCents: null, quantity: 1 }],
      });

      expect(result.profit).toBeNull();
      expect(result.marginPercent).toBeNull();
      expect(result.profitIsPartial).toBe(true);
    });

    it('custo 0 conta como custo informado (lucro = receita)', async () => {
      const { result } = await summarize({
        paidCents: 5000,
        paidItems: [{ unitPriceCents: 5000, unitCostCents: 0, quantity: 1 }],
      });

      expect(result.profit).toBe(50);
      expect(result.marginPercent).toBe(100);
      expect(result.profitIsPartial).toBe(false);
    });

    it('prejuízo: lucro e margem negativos', async () => {
      const { result } = await summarize({
        paidCents: 8000,
        paidItems: [{ unitPriceCents: 8000, unitCostCents: 10000, quantity: 1 }],
      });

      expect(result.profit).toBe(-20);
      expect(result.marginPercent).toBe(-25);
    });

    it('receita dos itens com custo igual a 0 (preço 0): margem null em vez de dividir por zero', async () => {
      const { result } = await summarize({
        paidItems: [{ unitPriceCents: 0, unitCostCents: 500, quantity: 1 }],
      });

      expect(result.profit).toBe(-5);
      expect(result.marginPercent).toBeNull();
    });

    it('arredonda a margem em 2 casas', async () => {
      // lucro 30 sobre receita 70 = 42,857142...%
      const { result } = await summarize({
        paidItems: [{ unitPriceCents: 7000, unitCostCents: 4000, quantity: 1 }],
      });

      expect(result.marginPercent).toBe(42.86);
    });

    it('não acumula erro de ponto flutuante (3 x 0,10 de lucro = 0,30)', async () => {
      const { result } = await summarize({
        paidItems: [{ unitPriceCents: 20, unitCostCents: 10, quantity: 3 }],
      });

      expect(result.profit).toBe(0.3);
    });
  });
});
