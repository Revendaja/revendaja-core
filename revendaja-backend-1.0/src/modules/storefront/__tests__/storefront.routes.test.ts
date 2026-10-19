import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const storeFindUnique = jest.fn();
const storeVisitCreate = jest.fn();
const storeVisitCount = jest.fn();
const storeProductFindMany = jest.fn();
const storeProductCount = jest.fn();
const saleFindUnique = jest.fn();
const saleCount = jest.fn();
const transaction = jest.fn();

// Objeto `tx` que o callback de $transaction recebe (criação do pedido).
const txStoreUpdate = jest.fn();
const txStoreProductFindMany = jest.fn();
const txStoreProductUpdateMany = jest.fn();
const txStoreProductFindUnique = jest.fn();
const txSaleCreate = jest.fn();
const queryRaw = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: { findUnique: (...args: unknown[]) => sessionFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    store: { findUnique: (...args: unknown[]) => storeFindUnique(...args) },
    storeVisit: {
      create: (...args: unknown[]) => storeVisitCreate(...args),
      count: (...args: unknown[]) => storeVisitCount(...args),
    },
    storeProduct: {
      findMany: (...args: unknown[]) => storeProductFindMany(...args),
      count: (...args: unknown[]) => storeProductCount(...args),
    },
    sale: {
      findUnique: (...args: unknown[]) => saleFindUnique(...args),
      count: (...args: unknown[]) => saleCount(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const TOKEN = signTestAccessToken(USER_ID);
const PRODUCT_A = '22222222-2222-4222-8222-222222222222';
const SALE_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const money = (value: number) => ({ toNumber: () => value });

function storeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store-1',
    userId: USER_ID,
    storeName: 'Leal Perfumaria',
    handle: 'lealperfumaria',
    catalogLink: 'https://lealperfumaria.revendaja.com',
    isOnline: true,
    bio: 'Cosméticos com entrega rápida.',
    createdAt: new Date(),
    ...overrides,
  };
}

const SETTINGS_ROW = {
  monthlyGoal: null,
  plan: 'free',
  acceptedPaymentMethods: ['pix', 'card', 'cash'],
  hideOutOfStock: true,
};

// A tabela `stores` é lida por handle (vitrine pública), por userId (app) e por id (configurações).
function arrangeStore(
  store: Record<string, unknown> | null = storeRow(),
  settings: Record<string, unknown> = SETTINGS_ROW,
) {
  storeFindUnique.mockImplementation(
    ({ where }: { where: { handle?: string; userId?: string; id?: string } }) => {
      if (where.handle)
        return Promise.resolve(store && where.handle === store.handle ? store : null);
      if (where.userId) return Promise.resolve(store);
      return Promise.resolve(store ? settings : null);
    },
  );
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SALE_ID,
    storeId: 'store-1',
    number: 7,
    clientRequestId: REQUEST_ID,
    customerName: 'Bia Lima',
    customerWhatsapp: '5511987654321',
    fulfillment: 'pickup',
    deliveryAddress: null,
    cashChangeFor: null,
    paymentMethod: 'pix',
    installments: null,
    status: 'pending',
    source: 'online',
    total: money(110),
    createdAt: new Date('2026-09-24T14:59:00.000Z'),
    items: [
      {
        id: 'item-1',
        saleId: SALE_ID,
        storeProductId: PRODUCT_A,
        productName: 'Kaiak Aventura 100 ml',
        productImageSm: 'https://img/k.jpg',
        quantity: 2,
        unitPrice: money(55),
        unitCost: money(30),
      },
    ],
    ...overrides,
  };
}

const validOrder = {
  clientRequestId: REQUEST_ID,
  customerName: 'Bia Lima',
  customerWhatsapp: '(11) 98765-4321',
  fulfillment: 'pickup',
  paymentMethod: 'pix',
  items: [{ storeProductId: PRODUCT_A, quantity: 2 }],
};

function arrangeOrderSuccess() {
  arrangeStore();
  saleFindUnique.mockResolvedValue(null);
  txStoreUpdate.mockResolvedValue({ saleCounter: 7 });
  txStoreProductFindMany.mockResolvedValue([
    {
      id: PRODUCT_A,
      storeId: 'store-1',
      price: money(55),
      costPrice: money(30),
      stock: 10,
      name: null,
      image: null,
      product: { name: 'Kaiak Aventura 100 ml', productImageSm: 'https://img/k.jpg' },
      components: [],
    },
  ]);
  txStoreProductUpdateMany.mockResolvedValue({ count: 1 });
  txSaleCreate.mockResolvedValue(orderRow());
}

async function call(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
  token: string | null = null,
) {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload,
  });
  await app.close();
  return response;
}

beforeEach(() => {
  [
    sessionFindUnique,
    userFindUnique,
    storeFindUnique,
    storeVisitCreate,
    storeVisitCount,
    storeProductFindMany,
    storeProductCount,
    saleFindUnique,
    saleCount,
    transaction,
    txStoreUpdate,
    txStoreProductFindMany,
    txStoreProductUpdateMany,
    txStoreProductFindUnique,
    txSaleCreate,
    queryRaw,
  ].forEach((mock) => mock.mockReset());

  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback({
      store: { update: txStoreUpdate },
      storeProduct: {
        findMany: txStoreProductFindMany,
        updateMany: txStoreProductUpdateMany,
        findUnique: txStoreProductFindUnique,
      },
      sale: { create: txSaleCreate },
    }),
  );
  arrangeStore();
});

describe('GET /public/stores/:handle (vitrine pública, sem login)', () => {
  it('devolve a loja, as formas de pagamento aceitas e os produtos, sem precisar de token', async () => {
    storeProductFindMany.mockResolvedValue([
      {
        id: PRODUCT_A,
        price: money(55),
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        stock: 10,
        product: {
          name: 'Kaiak Aventura 100 ml',
          description: 'Desodorante colônia',
          productImage: 'https://img/k.jpg',
          productImageSm: 'https://img/k-sm.jpg',
          brand: { name: 'Natura' },
        },
      },
    ]);
    storeProductCount.mockResolvedValue(1);

    const response = await call('GET', '/public/stores/lealperfumaria');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      store: {
        storeName: 'Leal Perfumaria',
        handle: 'lealperfumaria',
        bio: 'Cosméticos com entrega rápida.',
        acceptedPaymentMethods: ['pix', 'card', 'cash'],
      },
      products: {
        items: [
          {
            id: PRODUCT_A,
            name: 'Kaiak Aventura 100 ml',
            description: 'Desodorante colônia',
            brand: 'Natura',
            image: 'https://img/k.jpg',
            imageSm: 'https://img/k-sm.jpg',
            price: 55,
            promoPrice: null,
            isPromoActive: false,
            inStock: true,
            isNew: false,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      },
    });
  });

  it('NUNCA vaza custo, estoque exato, meta, plano nem dados internos', async () => {
    storeProductFindMany.mockResolvedValue([
      {
        id: PRODUCT_A,
        price: money(55),
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        costPrice: money(30),
        stock: 7,
        product: {
          name: 'Kaiak',
          description: null,
          productImage: null,
          productImageSm: null,
          brand: { name: 'Natura', profitability: 30 },
        },
      },
    ]);
    storeProductCount.mockResolvedValue(1);

    const response = await call('GET', '/public/stores/lealperfumaria');

    const serialized = JSON.stringify(response.json());
    expect(serialized).not.toMatch(
      /cost|"stock"|profitab|monthlyGoal|plan|userId|catalogLink|basePrice/i,
    );
    expect(response.json().products.items[0].inStock).toBe(true);
  });

  it('lista só produtos VISÍVEIS (isActive), da loja, e esconde os sem estoque quando a loja pediu', async () => {
    storeProductFindMany.mockResolvedValue([]);
    storeProductCount.mockResolvedValue(0);

    await call('GET', '/public/stores/lealperfumaria');

    expect(storeProductFindMany.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      isActive: true,
      frozen: false,
      stock: { gt: 0 },
    });
    expect(storeProductCount.mock.calls[0][0].where).toEqual(
      storeProductFindMany.mock.calls[0][0].where,
    );
  });

  it('loja que NÃO esconde produtos sem estoque: eles aparecem com inStock = false', async () => {
    arrangeStore(storeRow(), { ...SETTINGS_ROW, hideOutOfStock: false });
    storeProductFindMany.mockResolvedValue([
      {
        id: PRODUCT_A,
        price: money(55),
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        stock: 0,
        product: {
          name: 'Kaiak',
          description: null,
          productImage: null,
          productImageSm: null,
          brand: { name: 'Natura' },
        },
      },
    ]);
    storeProductCount.mockResolvedValue(1);

    const response = await call('GET', '/public/stores/lealperfumaria');

    expect(storeProductFindMany.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      isActive: true,
      frozen: false,
    });
    expect(response.json().products.items[0].inStock).toBe(false);
  });

  it('só devolve as formas de pagamento que a loja aceita', async () => {
    arrangeStore(storeRow(), { ...SETTINGS_ROW, acceptedPaymentMethods: ['pix'] });
    storeProductFindMany.mockResolvedValue([]);
    storeProductCount.mockResolvedValue(0);

    const response = await call('GET', '/public/stores/lealperfumaria');

    expect(response.json().store.acceptedPaymentMethods).toEqual(['pix']);
  });

  it('busca e paginação: search filtra pelo nome do produto (catálogo OU manual), page/pageSize viram skip/take', async () => {
    storeProductFindMany.mockResolvedValue([]);
    storeProductCount.mockResolvedValue(0);
    // Busca por nome vira "quais ids combinam por similaridade" (ver catalog.search.ts) — o mesmo
    // mock serve pro catálogo (id numérico) e pro nome do produto manual (id do StoreProduct).
    queryRaw.mockResolvedValue([{ id: 1 }]);

    await call('GET', '/public/stores/lealperfumaria?search=kaiak&page=3&pageSize=10');

    const args = storeProductFindMany.mock.calls[0][0];
    // OR com o nome próprio do produto manual: senão ele nunca apareceria numa busca na vitrine.
    expect(args.where.OR).toEqual([{ product: { id: { in: [1] } } }, { id: { in: [1] } }]);
    expect(args).toMatchObject({ skip: 20, take: 10 });
  });

  it('o handle é aceito em maiúsculas (a URL do cliente pode vir assim)', async () => {
    storeProductFindMany.mockResolvedValue([]);
    storeProductCount.mockResolvedValue(0);

    const response = await call('GET', '/public/stores/LealPerfumaria');

    expect(response.statusCode).toBe(200);
  });

  it('handle que não existe: 404 STORE_NOT_FOUND', async () => {
    const response = await call('GET', '/public/stores/naoexiste');

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('STORE_NOT_FOUND');
    expect(storeProductFindMany).not.toHaveBeenCalled();
  });

  it('loja desativada: 404 STORE_OFFLINE e não lista produto nenhum', async () => {
    arrangeStore(storeRow({ isOnline: false }));

    const response = await call('GET', '/public/stores/lealperfumaria');

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('STORE_OFFLINE');
    expect(storeProductFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ['pageSize acima de 60', '?pageSize=61'],
    ['page 0', '?page=0'],
    ['search vazio', '?search='],
  ])('retorna 400 para %s', async (_label, query) => {
    const response = await call('GET', `/public/stores/lealperfumaria${query}`);

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /public/stores/:handle/visits', () => {
  it('registra a visita na loja e responde 204 sem corpo, sem token', async () => {
    storeVisitCreate.mockResolvedValue({});

    const response = await call('POST', '/public/stores/lealperfumaria/visits');

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(storeVisitCreate).toHaveBeenCalledWith({ data: { storeId: 'store-1' } });
  });

  it('loja desativada: 404 STORE_OFFLINE e a visita NÃO é registrada', async () => {
    arrangeStore(storeRow({ isOnline: false }));

    const response = await call('POST', '/public/stores/lealperfumaria/visits');

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('STORE_OFFLINE');
    expect(storeVisitCreate).not.toHaveBeenCalled();
  });

  it('handle que não existe: 404 STORE_NOT_FOUND e nada é registrado', async () => {
    const response = await call('POST', '/public/stores/naoexiste/visits');

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('STORE_NOT_FOUND');
    expect(storeVisitCreate).not.toHaveBeenCalled();
  });
});

describe('POST /public/stores/:handle/orders (pedido do cliente = venda pendente da loja online)', () => {
  const URL = '/public/stores/lealperfumaria/orders';

  it('cria o pedido: 201, PENDENTE, com número, total e itens, sem precisar de token', async () => {
    arrangeOrderSuccess();

    const response = await call('POST', URL, validOrder);

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      number: 7,
      status: 'pending',
      total: 110,
      paymentMethod: 'pix',
      installments: null,
      customerName: 'Bia Lima',
    });
    expect(body.createdAt).toMatch(ISO_DATE);
    // Prazo do pagamento: 48 h depois de criado (padrão). Passou disso, o pedido é cancelado sozinho.
    expect(body.expiresAt).toBe('2026-09-26T14:59:00.000Z');
    expect(body.items).toEqual([
      { productName: 'Kaiak Aventura 100 ml', quantity: 2, unitPrice: 55, subtotal: 110 },
    ]);
  });

  it('grava a venda como PENDENTE e da loja ONLINE, com o WhatsApp só em dígitos', async () => {
    arrangeOrderSuccess();

    await call('POST', URL, validOrder);

    expect(txSaleCreate.mock.calls[0][0].data).toMatchObject({
      storeId: 'store-1',
      number: 7,
      status: 'pending',
      source: 'online',
      customerName: 'Bia Lima',
      customerWhatsapp: '11987654321',
      paymentMethod: 'pix',
    });
  });

  it('o comprovante NÃO vaza id da venda, WhatsApp, custo nem ids de produto', async () => {
    arrangeOrderSuccess();

    const response = await call('POST', URL, validOrder);

    const serialized = JSON.stringify(response.json());
    expect(serialized).not.toMatch(/cost|whatsapp|storeProductId|productImage|"id"/i);
    expect(serialized).not.toContain(SALE_ID);
  });

  it('o preço vem do servidor: ignora qualquer preço enviado pelo cliente', async () => {
    arrangeOrderSuccess();

    await call('POST', URL, {
      ...validOrder,
      items: [{ storeProductId: PRODUCT_A, quantity: 2, unitPrice: 1 }],
    });

    const [item] = txSaleCreate.mock.calls[0][0].data.items.create;
    expect(item.unitPrice.toNumber()).toBe(55);
    expect(txSaleCreate.mock.calls[0][0].data.total).toBe(110);
  });

  it('só vende produto VISÍVEL na vitrine e da própria loja', async () => {
    arrangeOrderSuccess();

    await call('POST', URL, validOrder);

    expect(txStoreProductFindMany.mock.calls[0][0].where).toEqual({
      id: { in: [PRODUCT_A] },
      storeId: 'store-1',
      isActive: true,
      frozen: false,
    });
  });

  it('reserva o estoque com UPDATE condicional dentro da transação', async () => {
    arrangeOrderSuccess();

    await call('POST', URL, validOrder);

    expect(txStoreProductUpdateMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_A, storeId: 'store-1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
  });

  it('mesmo clientRequestId: 200 com o MESMO pedido, sem nova transação nem nova baixa de estoque', async () => {
    arrangeStore();
    saleFindUnique.mockResolvedValue(orderRow());

    const response = await call('POST', URL, validOrder);

    expect(response.statusCode).toBe(200);
    expect(response.json().number).toBe(7);
    expect(transaction).not.toHaveBeenCalled();
    expect(txStoreProductUpdateMany).not.toHaveBeenCalled();
  });

  it('pagamento no cartão: parcelas são gravadas (sem informar, 1x)', async () => {
    arrangeOrderSuccess();
    txSaleCreate.mockResolvedValue(orderRow({ paymentMethod: 'card', installments: 3 }));

    const response = await call('POST', URL, {
      ...validOrder,
      paymentMethod: 'card',
      installments: 3,
    });

    expect(response.statusCode).toBe(201);
    expect(txSaleCreate.mock.calls[0][0].data.installments).toBe(3);
  });

  describe('retirada ou entrega, endereço e troco', () => {
    const ADDRESS = 'Rua das Flores, 100, apto 3, Centro';

    it('retirada: grava fulfillment pickup, sem endereço nem troco', async () => {
      arrangeOrderSuccess();

      const response = await call('POST', URL, { ...validOrder, fulfillment: 'pickup' });

      expect(response.statusCode).toBe(201);
      expect(txSaleCreate.mock.calls[0][0].data).toMatchObject({
        fulfillment: 'pickup',
        deliveryAddress: null,
        cashChangeFor: null,
      });
      expect(response.json()).toMatchObject({
        fulfillment: 'pickup',
        deliveryAddress: null,
        cashChangeFor: null,
      });
    });

    it('entrega: grava o endereço (sem espaços nas pontas) e devolve no comprovante', async () => {
      arrangeOrderSuccess();
      txSaleCreate.mockResolvedValue(
        orderRow({ fulfillment: 'delivery', deliveryAddress: ADDRESS }),
      );

      const response = await call('POST', URL, {
        ...validOrder,
        fulfillment: 'delivery',
        deliveryAddress: `  ${ADDRESS}  `,
      });

      expect(response.statusCode).toBe(201);
      expect(txSaleCreate.mock.calls[0][0].data).toMatchObject({
        fulfillment: 'delivery',
        deliveryAddress: ADDRESS,
        cashChangeFor: null,
      });
      expect(response.json()).toMatchObject({ fulfillment: 'delivery', deliveryAddress: ADDRESS });
    });

    it('entrega em dinheiro com troco: grava "troco para quanto"', async () => {
      arrangeOrderSuccess();
      txSaleCreate.mockResolvedValue(
        orderRow({
          paymentMethod: 'cash',
          fulfillment: 'delivery',
          deliveryAddress: ADDRESS,
          cashChangeFor: money(200),
        }),
      );

      const response = await call('POST', URL, {
        ...validOrder,
        paymentMethod: 'cash',
        fulfillment: 'delivery',
        deliveryAddress: ADDRESS,
        cashChangeFor: 200,
      });

      expect(response.statusCode).toBe(201);
      expect(txSaleCreate.mock.calls[0][0].data.cashChangeFor).toBe(200);
      expect(response.json().cashChangeFor).toBe(200);
    });

    it('entrega em dinheiro SEM troco (cliente tem o valor certo): cashChangeFor nulo', async () => {
      arrangeOrderSuccess();

      await call('POST', URL, {
        ...validOrder,
        paymentMethod: 'cash',
        fulfillment: 'delivery',
        deliveryAddress: ADDRESS,
        cashChangeFor: null,
      });

      expect(txSaleCreate.mock.calls[0][0].data.cashChangeFor).toBeNull();
    });

    it('troco menor que o total do pedido: 400 CHANGE_TOO_LOW, nada é gravado nem o estoque baixa', async () => {
      arrangeOrderSuccess();

      // O total do pedido de teste é R$ 110,00 (2 x R$ 55,00).
      const response = await call('POST', URL, {
        ...validOrder,
        paymentMethod: 'cash',
        fulfillment: 'delivery',
        deliveryAddress: ADDRESS,
        cashChangeFor: 100,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('CHANGE_TOO_LOW');
      expect(response.json().message).toContain('110,00');
      expect(txSaleCreate).not.toHaveBeenCalled();
    });

    it('troco exatamente igual ao total é aceito', async () => {
      arrangeOrderSuccess();

      const response = await call('POST', URL, {
        ...validOrder,
        paymentMethod: 'cash',
        fulfillment: 'delivery',
        deliveryAddress: ADDRESS,
        cashChangeFor: 110,
      });

      expect(response.statusCode).toBe(201);
    });
  });

  it('forma de pagamento que a loja NÃO aceita: 400 PAYMENT_METHOD_NOT_ACCEPTED e nada é criado', async () => {
    arrangeStore(storeRow(), { ...SETTINGS_ROW, acceptedPaymentMethods: ['pix'] });

    const response = await call('POST', URL, { ...validOrder, paymentMethod: 'cash' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('PAYMENT_METHOD_NOT_ACCEPTED');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('loja desativada: 404 STORE_OFFLINE e o pedido NÃO é criado', async () => {
    arrangeStore(storeRow({ isOnline: false }));

    const response = await call('POST', URL, validOrder);

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('STORE_OFFLINE');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('handle que não existe: 404 STORE_NOT_FOUND', async () => {
    const response = await call('POST', '/public/stores/naoexiste/orders', validOrder);

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('STORE_NOT_FOUND');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('estoque insuficiente: 409 com o produto e o disponível, e o pedido NÃO é criado', async () => {
    arrangeOrderSuccess();
    txStoreProductUpdateMany.mockResolvedValue({ count: 0 });
    txStoreProductFindUnique.mockResolvedValue({ stock: 1 });

    const response = await call('POST', URL, validOrder);

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      'Estoque insuficiente para "Kaiak Aventura 100 ml": disponível 1.',
    );
    expect(txSaleCreate).not.toHaveBeenCalled();
  });

  it('produto oculto na vitrine ou de outra loja: 404 com mensagem para o cliente', async () => {
    arrangeOrderSuccess();
    txStoreProductFindMany.mockResolvedValue([]);

    const response = await call('POST', URL, validOrder);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Um dos produtos não está mais disponível nesta loja.');
    expect(txStoreProductUpdateMany).not.toHaveBeenCalled();
  });

  it('o mesmo produto duas vezes: 400 DUPLICATE_SALE_ITEM', async () => {
    arrangeStore();

    const response = await call('POST', URL, {
      ...validOrder,
      items: [
        { storeProductId: PRODUCT_A, quantity: 1 },
        { storeProductId: PRODUCT_A, quantity: 1 },
      ],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('DUPLICATE_SALE_ITEM');
    expect(transaction).not.toHaveBeenCalled();
  });

  describe('validação do body (400 VALIDATION_ERROR, sem tocar no banco)', () => {
    it.each([
      ['clientRequestId ausente', { clientRequestId: undefined }],
      ['clientRequestId que não é UUID', { clientRequestId: 'abc' }],
      ['customerName vazio', { customerName: '   ' }],
      ['customerName com mais de 120 caracteres', { customerName: 'a'.repeat(121) }],
      ['WhatsApp ausente (a loja precisa falar com o cliente)', { customerWhatsapp: undefined }],
      ['WhatsApp curto demais', { customerWhatsapp: '1198765' }],
      ['WhatsApp só com letras', { customerWhatsapp: 'abcdefghijk' }],
      ['WhatsApp com dígitos demais', { customerWhatsapp: '1'.repeat(16) }],
      ['fiado (on_account não existe mais)', { paymentMethod: 'on_account' }],
      ['paymentMethod inválido', { paymentMethod: 'boleto' }],
      ['parcelas em pagamento que não é cartão', { paymentMethod: 'pix', installments: 3 }],
      ['parcelas acima de 24', { paymentMethod: 'card', installments: 25 }],
      ['fulfillment ausente', { fulfillment: undefined }],
      ['fulfillment inválido', { fulfillment: 'drone' }],
      ['entrega sem endereço', { fulfillment: 'delivery' }],
      ['entrega com endereço curto demais', { fulfillment: 'delivery', deliveryAddress: 'Rua 1' }],
      [
        'entrega com endereço longo demais',
        { fulfillment: 'delivery', deliveryAddress: 'a'.repeat(301) },
      ],
      [
        'retirada com endereço (só vale na entrega)',
        { fulfillment: 'pickup', deliveryAddress: 'Rua das Flores, 100, Centro' },
      ],
      [
        'troco em pagamento que não é dinheiro',
        {
          fulfillment: 'delivery',
          deliveryAddress: 'Rua das Flores, 100, Centro',
          paymentMethod: 'pix',
          cashChangeFor: 200,
        },
      ],
      [
        'troco na retirada (só vale na entrega)',
        { fulfillment: 'pickup', paymentMethod: 'cash', cashChangeFor: 200 },
      ],
      [
        'troco zero',
        {
          fulfillment: 'delivery',
          deliveryAddress: 'Rua das Flores, 100, Centro',
          paymentMethod: 'cash',
          cashChangeFor: 0,
        },
      ],
      [
        'troco negativo',
        {
          fulfillment: 'delivery',
          deliveryAddress: 'Rua das Flores, 100, Centro',
          paymentMethod: 'cash',
          cashChangeFor: -10,
        },
      ],
      ['items vazio', { items: [] }],
      ['items ausente', { items: undefined }],
      ['storeProductId que não é UUID', { items: [{ storeProductId: '1', quantity: 1 }] }],
      ['quantity 0', { items: [{ storeProductId: PRODUCT_A, quantity: 0 }] }],
      ['quantity decimal', { items: [{ storeProductId: PRODUCT_A, quantity: 1.5 }] }],
    ])('%s', async (_label, override) => {
      const response = await call('POST', URL, { ...validOrder, ...override });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
      expect(transaction).not.toHaveBeenCalled();
    });

    it('mais de 50 itens', async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        storeProductId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        quantity: 1,
      }));

      const response = await call('POST', URL, { ...validOrder, items });

      expect(response.statusCode).toBe(400);
    });
  });
});

describe('GET /store/stats (tela Minha Loja, autenticada)', () => {
  function arrangeVerified() {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ana Souza',
      email: 'ana@email.com',
      whatsapp: '5511982214432',
      passwordHash: 'hash',
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
    });
  }

  it('retorna 401 sem token', async () => {
    const response = await call('GET', '/store/stats');

    expect(response.statusCode).toBe(401);
  });

  it('retorna 403 quando o e-mail ainda não foi verificado', async () => {
    userFindUnique.mockResolvedValue({ id: USER_ID, phoneVerifiedAt: null });

    const response = await call('GET', '/store/stats', undefined, TOKEN);

    expect(response.statusCode).toBe(403);
  });

  it('retorna 404 quando a conta não tem loja', async () => {
    arrangeVerified();
    arrangeStore(null);
    storeFindUnique.mockResolvedValue(null);

    const response = await call('GET', '/store/stats', undefined, TOKEN);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Você ainda não possui uma loja.');
  });

  it('devolve as visitas dos últimos 7 dias e o total de pedidos feitos pela vitrine', async () => {
    arrangeVerified();
    storeVisitCount.mockResolvedValue(184);
    saleCount.mockResolvedValue(13);

    const response = await call('GET', '/store/stats', undefined, TOKEN);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ visitsLast7Days: 184, ordersCount: 13 });
  });

  it('as visitas contadas são da PRÓPRIA loja e só de 7 dias para cá; os pedidos, só os online', async () => {
    arrangeVerified();
    storeVisitCount.mockResolvedValue(0);
    saleCount.mockResolvedValue(0);
    const before = Date.now();

    await call('GET', '/store/stats', undefined, TOKEN);

    const where = storeVisitCount.mock.calls[0][0].where;
    expect(where.storeId).toBe('store-1');
    const sinceMs = (where.createdAt.gte as Date).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    // O início da janela é "agora - 7 dias": calculado logo depois de `before`, então cai logo acima dele.
    expect(sinceMs).toBeGreaterThanOrEqual(before - sevenDays);
    expect(sinceMs).toBeLessThan(before - sevenDays + 60_000);
    // Pedido cancelado não conta nos "pedidos feitos".
    expect(saleCount.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      source: 'online',
      status: { not: 'cancelled' },
    });
  });

  it('a dona vê os números mesmo com a loja desativada', async () => {
    arrangeVerified();
    arrangeStore(storeRow({ isOnline: false }));
    storeVisitCount.mockResolvedValue(5);
    saleCount.mockResolvedValue(2);

    const response = await call('GET', '/store/stats', undefined, TOKEN);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ visitsLast7Days: 5, ordersCount: 2 });
  });
});
