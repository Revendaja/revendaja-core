import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const userFindUnique = jest.fn();
const storeFindUnique = jest.fn();
const saleFindUnique = jest.fn();
const saleFindFirst = jest.fn();
const saleFindMany = jest.fn();
const saleCount = jest.fn();
const saleUpdateMany = jest.fn();
const saleGroupBy = jest.fn();
const saleItemFindMany = jest.fn();
const storeProductFindMany = jest.fn();
const transaction = jest.fn();

// Objeto `tx` que o callback de $transaction recebe.
const txStoreUpdate = jest.fn();
const txStoreProductFindMany = jest.fn();
const txStoreProductUpdateMany = jest.fn();
const txStoreProductFindUnique = jest.fn();
const txSaleCreate = jest.fn();
const txSaleUpdateMany = jest.fn();
const txSaleFindFirst = jest.fn();
const txSaleItemFindMany = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: { findUnique: (...args: unknown[]) => sessionFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    store: { findUnique: (...args: unknown[]) => storeFindUnique(...args) },
    sale: {
      findUnique: (...args: unknown[]) => saleFindUnique(...args),
      findFirst: (...args: unknown[]) => saleFindFirst(...args),
      findMany: (...args: unknown[]) => saleFindMany(...args),
      count: (...args: unknown[]) => saleCount(...args),
      updateMany: (...args: unknown[]) => saleUpdateMany(...args),
      groupBy: (...args: unknown[]) => saleGroupBy(...args),
    },
    saleItem: { findMany: (...args: unknown[]) => saleItemFindMany(...args) },
    storeProduct: { findMany: (...args: unknown[]) => storeProductFindMany(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const TOKEN = signTestAccessToken(USER_ID);
const SALE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_A = '22222222-2222-4222-8222-222222222222';
const PRODUCT_B = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const money = (value: number) => ({ toNumber: () => value });

const OWN_STORE = {
  id: 'store-1',
  userId: USER_ID,
  storeName: 'Leal Perfumaria',
  handle: 'lealperfumaria',
  catalogLink: 'https://lealperfumaria.revendaja.com',
  isOnline: true,
  createdAt: new Date(),
};

function buildUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    name: 'Ana Souza',
    email: 'ana@email.com',
    whatsapp: '5511982214432',
    passwordHash: 'hash',
    phoneVerifiedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// Linha de `sales` como o Prisma devolve (com o CUSTO no item, que a API NÃO pode vazar).
function buildSaleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SALE_ID,
    storeId: 'store-1',
    number: 42,
    clientRequestId: REQUEST_ID,
    customerName: 'Ana Souza',
    paymentMethod: 'pix',
    installments: null,
    status: 'paid',
    source: 'manual',
    customerWhatsapp: null,
    fulfillment: null,
    deliveryAddress: null,
    cashChangeFor: null,
    total: money(110),
    createdAt: new Date('2026-09-23T15:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        saleId: SALE_ID,
        storeProductId: PRODUCT_A,
        productName: 'Kaiak Aventura 100 ml',
        productImageSm: 'https://img/kaiak-small.jpg',
        quantity: 2,
        unitPrice: money(55),
        unitCost: money(30),
      },
    ],
    ...overrides,
  };
}

function buildStoreProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_A,
    storeId: 'store-1',
    price: money(55),
    costPrice: money(30),
    stock: 10,
    name: null,
    image: null,
    product: { name: 'Kaiak Aventura 100 ml', productImageSm: 'https://img/kaiak-small.jpg' },
    // Componentes do kit (produto manual composto): vazio = produto comum, não debita mais nada.
    components: [],
    ...overrides,
  };
}

const validBody = {
  clientRequestId: REQUEST_ID,
  customerName: 'Ana Souza',
  paymentMethod: 'pix',
  items: [{ storeProductId: PRODUCT_A, quantity: 2 }],
};

function arrangeVerifiedStore() {
  userFindUnique.mockResolvedValue(buildUserRow());
  storeFindUnique.mockResolvedValue(OWN_STORE);
}

async function request(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
  token: string | null = TOKEN,
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
    saleFindUnique,
    saleFindFirst,
    saleFindMany,
    saleCount,
    saleUpdateMany,
    saleGroupBy,
    saleItemFindMany,
    storeProductFindMany,
    transaction,
    txStoreUpdate,
    txStoreProductFindMany,
    txStoreProductUpdateMany,
    txStoreProductFindUnique,
    txSaleCreate,
    txSaleUpdateMany,
    txSaleFindFirst,
    txSaleItemFindMany,
  ].forEach((mock) => mock.mockReset());

  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  // O Prisma real desfaz a transação quando o callback lança: aqui a promise
  // rejeita do mesmo jeito.
  transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback({
      store: { update: txStoreUpdate },
      storeProduct: {
        findMany: txStoreProductFindMany,
        updateMany: txStoreProductUpdateMany,
        findUnique: txStoreProductFindUnique,
      },
      sale: { create: txSaleCreate, updateMany: txSaleUpdateMany, findFirst: txSaleFindFirst },
      saleItem: { findMany: txSaleItemFindMany },
    }),
  );
});

describe('acesso às rotas de vendas', () => {
  // Os bodies são válidos de propósito: no Fastify a validação do body roda ANTES
  // da autenticação (preHandler), então um body inválido daria 400 em vez de 401.
  it.each([
    ['POST', '/sales', validBody],
    ['GET', '/sales', undefined],
    ['GET', `/sales/summary?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z`, undefined],
    ['GET', `/sales/${SALE_ID}`, undefined],
    ['PATCH', `/sales/${SALE_ID}`, { status: 'paid' }],
  ] as const)('%s %s retorna 401 sem token', async (method, url, payload) => {
    const response = await request(method, url, payload, null);

    expect(response.statusCode).toBe(401);
  });

  it('retorna 403 quando o e-mail ainda não foi verificado', async () => {
    userFindUnique.mockResolvedValue(buildUserRow({ phoneVerifiedAt: null }));

    const response = await request('GET', '/sales');

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe('Confirme seu e-mail antes de gerenciar a loja.');
  });

  it('retorna 404 "Você ainda não possui uma loja." quando não há loja', async () => {
    userFindUnique.mockResolvedValue(buildUserRow());
    storeFindUnique.mockResolvedValue(null);

    const response = await request('GET', '/sales');

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Você ainda não possui uma loja.');
  });
});

describe('POST /sales', () => {
  function arrangeSuccess() {
    arrangeVerifiedStore();
    saleFindUnique.mockResolvedValue(null); // nenhuma venda com esse clientRequestId
    txStoreUpdate.mockResolvedValue({ saleCounter: 42 });
    txStoreProductFindMany.mockResolvedValue([buildStoreProductRow()]);
    txStoreProductUpdateMany.mockResolvedValue({ count: 1 });
    txSaleCreate.mockResolvedValue(buildSaleRow());
  }

  it('cria a venda: 201, número, total e itens gravados no momento da venda', async () => {
    arrangeSuccess();

    const response = await request('POST', '/sales', validBody);

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      id: SALE_ID,
      number: 42,
      status: 'paid',
      paymentMethod: 'pix',
      installments: null,
      total: 110,
      customerName: 'Ana Souza',
    });
    expect(body.createdAt).toMatch(ISO_DATE);
    expect(body.items).toEqual([
      {
        storeProductId: PRODUCT_A,
        productName: 'Kaiak Aventura 100 ml',
        productImageSm: 'https://img/kaiak-small.jpg',
        quantity: 2,
        unitPrice: 55,
        subtotal: 110,
      },
    ]);
  });

  it('NUNCA vaza custo, lucro ou margem na resposta da venda', async () => {
    arrangeSuccess();

    const response = await request('POST', '/sales', validBody);

    const serialized = JSON.stringify(response.json());
    expect(serialized).not.toMatch(/unitCost|costPrice|profit|margin|cost/i);
    expect(response.json().items[0]).not.toHaveProperty('unitCost');
  });

  it('o preço vem do servidor: usa o preço da loja e copia o custo para o item', async () => {
    arrangeSuccess();

    // Mesmo que o app tente mandar um preço, ele é ignorado (campo desconhecido).
    await request('POST', '/sales', {
      ...validBody,
      items: [{ storeProductId: PRODUCT_A, quantity: 2, unitPrice: 1 }],
    });

    const created = txSaleCreate.mock.calls[0][0].data;
    expect(created.total).toBe(110);
    expect(created.number).toBe(42);
    expect(created.items.create).toHaveLength(1);
    const [item] = created.items.create;
    expect(item).toMatchObject({
      storeProductId: PRODUCT_A,
      productName: 'Kaiak Aventura 100 ml',
      productImageSm: 'https://img/kaiak-small.jpg',
      quantity: 2,
    });
    // O preço (55) e o custo (30) gravados são os da LOJA, não o "1" enviado pelo app.
    expect(item.unitPrice.toNumber()).toBe(55);
    expect(item.unitCost.toNumber()).toBe(30);
  });

  it('baixa o estoque com UPDATE condicional (stock >= quantidade) dentro da transação', async () => {
    arrangeSuccess();

    await request('POST', '/sales', validBody);

    expect(txStoreProductUpdateMany).toHaveBeenCalledWith({
      where: { id: PRODUCT_A, storeId: 'store-1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
  });

  it('a soma do total é feita em centavos (3 x 0,10 = 0,30)', async () => {
    arrangeSuccess();
    txStoreProductFindMany.mockResolvedValue([buildStoreProductRow({ price: money(0.1) })]);

    await request('POST', '/sales', {
      ...validBody,
      items: [{ storeProductId: PRODUCT_A, quantity: 3 }],
    });

    expect(txSaleCreate.mock.calls[0][0].data.total).toBe(0.3);
  });

  it('cobra o preço promocional quando ainda vale (promoEndsAt no futuro)', async () => {
    arrangeSuccess();
    txStoreProductFindMany.mockResolvedValue([
      buildStoreProductRow({
        price: money(55),
        promoPrice: money(39.9),
        promoEndsAt: new Date(Date.now() + 60_000),
      }),
    ]);

    await request('POST', '/sales', validBody);

    const [item] = txSaleCreate.mock.calls[0][0].data.items.create;
    expect(item.unitPrice.toNumber()).toBe(39.9);
    expect(txSaleCreate.mock.calls[0][0].data.total).toBe(79.8);
  });

  it('cobra o preço normal quando a promoção já venceu (promoEndsAt no passado)', async () => {
    arrangeSuccess();
    txStoreProductFindMany.mockResolvedValue([
      buildStoreProductRow({
        price: money(55),
        promoPrice: money(39.9),
        promoEndsAt: new Date(Date.now() - 60_000),
      }),
    ]);

    await request('POST', '/sales', validBody);

    const [item] = txSaleCreate.mock.calls[0][0].data.items.create;
    expect(item.unitPrice.toNumber()).toBe(55);
  });

  it.each([
    ['pix', undefined, 'paid', null],
    ['cash', undefined, 'paid', null],
    ['card', 3, 'paid', 3],
    ['card', undefined, 'paid', 1],
  ] as const)(
    '%s com parcelas %s nasce %s e installments %s',
    async (paymentMethod, installments, status, expectedInstallments) => {
      arrangeSuccess();

      await request('POST', '/sales', { ...validBody, paymentMethod, installments });

      const created = txSaleCreate.mock.calls[0][0].data;
      expect(created.status).toBe(status);
      expect(created.installments).toBe(expectedInstallments);
    },
  );

  it('venda de produto com isActive = false é permitida (visibilidade é só da vitrine)', async () => {
    arrangeSuccess();
    txStoreProductFindMany.mockResolvedValue([buildStoreProductRow({ isActive: false })]);

    const response = await request('POST', '/sales', validBody);

    expect(response.statusCode).toBe(201);
  });

  it('clientRequestId repetido: 200 com a MESMA venda, sem transação nem nova baixa de estoque', async () => {
    arrangeVerifiedStore();
    saleFindUnique.mockResolvedValue(buildSaleRow());

    const response = await request('POST', '/sales', validBody);

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(SALE_ID);
    expect(response.json().number).toBe(42);
    expect(transaction).not.toHaveBeenCalled();
    expect(txStoreProductUpdateMany).not.toHaveBeenCalled();
  });

  it('duas chamadas iguais ao mesmo tempo: a perdedora cai no índice único e recebe a venda da vencedora', async () => {
    arrangeVerifiedStore();
    saleFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(buildSaleRow());
    txStoreUpdate.mockResolvedValue({ saleCounter: 43 });
    txStoreProductFindMany.mockResolvedValue([buildStoreProductRow()]);
    txStoreProductUpdateMany.mockResolvedValue({ count: 1 });
    txSaleCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    );

    const response = await request('POST', '/sales', validBody);

    expect(response.statusCode).toBe(200);
    expect(response.json().number).toBe(42);
  });

  it('estoque insuficiente: 409 com o nome do produto, e a venda NÃO é criada', async () => {
    arrangeVerifiedStore();
    saleFindUnique.mockResolvedValue(null);
    txStoreUpdate.mockResolvedValue({ saleCounter: 42 });
    txStoreProductFindMany.mockResolvedValue([buildStoreProductRow()]);
    txStoreProductUpdateMany.mockResolvedValue({ count: 0 });
    txStoreProductFindUnique.mockResolvedValue({ stock: 1 });

    const response = await request('POST', '/sales', validBody);

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      'Estoque insuficiente para "Kaiak Aventura 100 ml": disponível 1.',
    );
    expect(txSaleCreate).not.toHaveBeenCalled();
  });

  it('produto que não é da loja (ou não existe): 404 e nada é baixado', async () => {
    arrangeVerifiedStore();
    saleFindUnique.mockResolvedValue(null);
    txStoreUpdate.mockResolvedValue({ saleCounter: 42 });
    txStoreProductFindMany.mockResolvedValue([]);

    const response = await request('POST', '/sales', validBody);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Produto não encontrado na sua loja.');
    expect(txStoreProductUpdateMany).not.toHaveBeenCalled();
    expect(txSaleCreate).not.toHaveBeenCalled();
  });

  it('a busca de produtos é escopada pela loja (não enxerga produto de outra loja)', async () => {
    arrangeSuccess();

    await request('POST', '/sales', validBody);

    expect(txStoreProductFindMany.mock.calls[0][0].where).toEqual({
      id: { in: [PRODUCT_A] },
      storeId: 'store-1',
    });
  });

  it('o mesmo produto duas vezes: 400 DUPLICATE_SALE_ITEM', async () => {
    arrangeVerifiedStore();

    const response = await request('POST', '/sales', {
      ...validBody,
      items: [
        { storeProductId: PRODUCT_A, quantity: 1 },
        { storeProductId: PRODUCT_A, quantity: 1 },
      ],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('DUPLICATE_SALE_ITEM');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('vários produtos: cada um baixa o seu estoque', async () => {
    arrangeSuccess();
    txStoreProductFindMany.mockResolvedValue([
      buildStoreProductRow(),
      buildStoreProductRow({ id: PRODUCT_B, price: money(20), costPrice: null }),
    ]);

    await request('POST', '/sales', {
      ...validBody,
      items: [
        { storeProductId: PRODUCT_A, quantity: 2 },
        { storeProductId: PRODUCT_B, quantity: 1 },
      ],
    });

    expect(txStoreProductUpdateMany).toHaveBeenCalledTimes(2);
    expect(txSaleCreate.mock.calls[0][0].data.total).toBe(130);
    // Produto sem custo informado: o item grava unitCost null.
    const items = txSaleCreate.mock.calls[0][0].data.items.create;
    expect(
      items.find((i: { storeProductId: string }) => i.storeProductId === PRODUCT_B).unitCost,
    ).toBeNull();
  });

  describe('validação do body (400 VALIDATION_ERROR, sem tocar no banco)', () => {
    it.each([
      ['clientRequestId ausente', { clientRequestId: undefined }],
      ['clientRequestId que não é UUID', { clientRequestId: 'abc' }],
      ['customerName vazio', { customerName: '' }],
      ['customerName só com espaços', { customerName: '   ' }],
      ['customerName com mais de 120 caracteres', { customerName: 'a'.repeat(121) }],
      ['paymentMethod inválido', { paymentMethod: 'boleto' }],
      ['paymentMethod fiado (on_account não existe mais)', { paymentMethod: 'on_account' }],
      ['installments 0', { paymentMethod: 'card', installments: 0 }],
      ['installments decimal', { paymentMethod: 'card', installments: 1.5 }],
      ['installments acima de 24', { paymentMethod: 'card', installments: 25 }],
      ['parcelas em pagamento que não é cartão', { paymentMethod: 'pix', installments: 3 }],
      ['items vazio', { items: [] }],
      ['items ausente', { items: undefined }],
      ['storeProductId que não é UUID', { items: [{ storeProductId: '1', quantity: 1 }] }],
      ['quantity 0', { items: [{ storeProductId: PRODUCT_A, quantity: 0 }] }],
      ['quantity negativa', { items: [{ storeProductId: PRODUCT_A, quantity: -1 }] }],
      ['quantity decimal', { items: [{ storeProductId: PRODUCT_A, quantity: 1.5 }] }],
    ])('%s', async (_label, override) => {
      const response = await request('POST', '/sales', { ...validBody, ...override });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('VALIDATION_ERROR');
      expect(transaction).not.toHaveBeenCalled();
    });

    it('mais de 50 itens', async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        storeProductId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        quantity: 1,
      }));

      const response = await request('POST', '/sales', { ...validBody, items });

      expect(response.statusCode).toBe(400);
    });

    it('installments null em pagamento que não é cartão é aceito (tratado como ausente)', async () => {
      arrangeSuccess();

      const response = await request('POST', '/sales', { ...validBody, installments: null });

      expect(response.statusCode).toBe(201);
    });

    it('customerName é gravado sem os espaços das pontas', async () => {
      arrangeSuccess();

      await request('POST', '/sales', { ...validBody, customerName: '  Ana Souza  ' });

      expect(txSaleCreate.mock.calls[0][0].data.customerName).toBe('Ana Souza');
    });
  });
});

describe('GET /sales', () => {
  function arrangeList() {
    arrangeVerifiedStore();
    saleFindMany.mockResolvedValue([buildSaleRow({ items: undefined })]);
    saleCount.mockResolvedValue(1);
  }

  it('lista as vendas (sem itens), mais recente primeiro, no formato paginado', async () => {
    arrangeList();

    const response = await request('GET', '/sales');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: SALE_ID,
          number: 42,
          createdAt: '2026-09-23T15:00:00.000Z',
          status: 'paid',
          source: 'manual',
          paymentMethod: 'pix',
          installments: null,
          total: 110,
          customerName: 'Ana Souza',
          customerWhatsapp: null,
          fulfillment: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    expect(saleFindMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { number: 'desc' },
    ]);
  });

  it('venda ANTIGA de fiado (on_account, pendente) continua aparecendo na lista', async () => {
    arrangeVerifiedStore();
    saleFindMany.mockResolvedValue([
      buildSaleRow({ items: undefined, paymentMethod: 'on_account', status: 'pending' }),
    ]);
    saleCount.mockResolvedValue(1);

    const response = await request('GET', '/sales');

    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      paymentMethod: 'on_account',
      status: 'pending',
    });
  });

  it('pedido online pendente aparece na lista com origem e WhatsApp do cliente', async () => {
    arrangeVerifiedStore();
    saleFindMany.mockResolvedValue([
      buildSaleRow({
        items: undefined,
        source: 'online',
        status: 'pending',
        customerWhatsapp: '5511987654321',
      }),
    ]);
    saleCount.mockResolvedValue(1);

    const response = await request('GET', '/sales');

    expect(response.json().items[0]).toMatchObject({
      source: 'online',
      status: 'pending',
      customerWhatsapp: '5511987654321',
    });
  });

  it('filtra por origem: só os pedidos da vitrine (source=online)', async () => {
    arrangeList();

    await request('GET', '/sales?source=online&status=pending');

    expect(saleFindMany.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      status: 'pending',
      source: 'online',
    });
  });

  it('venda registrada pela loja é gravada como manual, paga e sem WhatsApp', async () => {
    arrangeVerifiedStore();
    saleFindUnique.mockResolvedValue(null);
    txStoreUpdate.mockResolvedValue({ saleCounter: 42 });
    txStoreProductFindMany.mockResolvedValue([buildStoreProductRow()]);
    txStoreProductUpdateMany.mockResolvedValue({ count: 1 });
    txSaleCreate.mockResolvedValue(buildSaleRow());

    await request('POST', '/sales', validBody);

    expect(txSaleCreate.mock.calls[0][0].data).toMatchObject({
      status: 'paid',
      source: 'manual',
      customerWhatsapp: null,
    });
  });

  it('sem filtros: só a loja no where', async () => {
    arrangeList();

    await request('GET', '/sales');

    expect(saleFindMany.mock.calls[0][0].where).toEqual({ storeId: 'store-1' });
  });

  it('período: from inclusivo (gte) e to exclusivo (lt), e status', async () => {
    arrangeList();

    await request(
      'GET',
      '/sales?from=2026-09-01T03:00:00.000Z&to=2026-10-01T03:00:00.000Z&status=pending',
    );

    expect(saleFindMany.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      status: 'pending',
      createdAt: {
        gte: new Date('2026-09-01T03:00:00.000Z'),
        lt: new Date('2026-10-01T03:00:00.000Z'),
      },
    });
    expect(saleCount.mock.calls[0][0].where).toEqual(saleFindMany.mock.calls[0][0].where);
  });

  it('aceita datas com offset (fuso do aparelho) e converte para o mesmo instante', async () => {
    arrangeList();

    await request('GET', '/sales?from=2026-09-01T00:00:00-03:00');

    expect(saleFindMany.mock.calls[0][0].where.createdAt.gte).toEqual(
      new Date('2026-09-01T03:00:00.000Z'),
    );
  });

  it('paginação: page e pageSize viram skip e take', async () => {
    arrangeList();

    await request('GET', '/sales?page=3&pageSize=10');

    expect(saleFindMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
  });

  it.each([
    ['from que não é data', '?from=ontem'],
    ['data sem horário', '?from=2026-09-01'],
    ['from depois de to', '?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z'],
    ['from igual a to', '?from=2026-09-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z'],
    ['status inválido', '?status=refunded'],
    ['pageSize acima de 100', '?pageSize=101'],
    ['page 0', '?page=0'],
  ])('retorna 400 para %s', async (_label, query) => {
    arrangeList();

    const response = await request('GET', `/sales${query}`);

    expect(response.statusCode).toBe(400);
    expect(saleFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /sales/summary', () => {
  const QUERY = '?from=2026-09-01T03:00:00.000Z&to=2026-10-01T03:00:00.000Z';

  it('calcula faturamento, a receber, lucro, margem e parcial a partir do período', async () => {
    arrangeVerifiedStore();
    saleGroupBy.mockResolvedValue([
      { status: 'paid', _sum: { total: money(300) } },
      { status: 'pending', _sum: { total: money(125.5) } },
    ]);
    saleItemFindMany.mockResolvedValue([
      { unitPrice: money(100), unitCost: money(60), quantity: 2 }, // lucro 80, receita 200
      { unitPrice: money(50), unitCost: null, quantity: 2 }, // sem custo
    ]);

    const response = await request('GET', `/sales/summary${QUERY}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      grossRevenue: 425.5,
      pendingTotal: 125.5,
      profit: 80,
      marginPercent: 40,
      profitIsPartial: true,
    });
  });

  it('período sem vendas: zeros e lucro/margem null', async () => {
    arrangeVerifiedStore();
    saleGroupBy.mockResolvedValue([]);
    saleItemFindMany.mockResolvedValue([]);

    const response = await request('GET', `/sales/summary${QUERY}`);

    expect(response.json()).toEqual({
      grossRevenue: 0,
      pendingTotal: 0,
      profit: null,
      marginPercent: null,
      profitIsPartial: false,
    });
  });

  it('consulta só a loja e o período (from inclusivo, to exclusivo); lucro só de vendas PAGAS', async () => {
    arrangeVerifiedStore();
    saleGroupBy.mockResolvedValue([]);
    saleItemFindMany.mockResolvedValue([]);

    await request('GET', `/sales/summary${QUERY}`);

    const createdAt = {
      gte: new Date('2026-09-01T03:00:00.000Z'),
      lt: new Date('2026-10-01T03:00:00.000Z'),
    };
    expect(saleGroupBy.mock.calls[0][0].where).toEqual({ storeId: 'store-1', createdAt });
    expect(saleItemFindMany.mock.calls[0][0].where).toEqual({
      sale: { storeId: 'store-1', status: 'paid', createdAt },
    });
  });

  it.each([
    ['sem from nem to', ''],
    ['sem to', '?from=2026-09-01T03:00:00.000Z'],
    ['sem from', '?to=2026-10-01T03:00:00.000Z'],
    ['from depois de to', '?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z'],
    ['data inválida', '?from=x&to=y'],
  ])('retorna 400 %s (o período é obrigatório)', async (_label, query) => {
    arrangeVerifiedStore();

    const response = await request('GET', `/sales/summary${query}`);

    expect(response.statusCode).toBe(400);
    expect(saleGroupBy).not.toHaveBeenCalled();
  });

  it('com source=online: totais e lucro SÓ dos pedidos da vitrine', async () => {
    arrangeVerifiedStore();
    saleGroupBy.mockResolvedValue([{ status: 'paid', _sum: { total: money(300) } }]);
    saleItemFindMany.mockResolvedValue([]);

    const response = await request('GET', `/sales/summary${QUERY}&source=online`);

    expect(response.statusCode).toBe(200);
    const createdAt = {
      gte: new Date('2026-09-01T03:00:00.000Z'),
      lt: new Date('2026-10-01T03:00:00.000Z'),
    };
    expect(saleGroupBy.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      createdAt,
      source: 'online',
    });
    expect(saleItemFindMany.mock.calls[0][0].where).toEqual({
      sale: { storeId: 'store-1', status: 'paid', createdAt, source: 'online' },
    });
  });

  it('source inválido no resumo: 400', async () => {
    arrangeVerifiedStore();

    const response = await request('GET', `/sales/summary${QUERY}&source=whatsapp`);

    expect(response.statusCode).toBe(400);
    expect(saleGroupBy).not.toHaveBeenCalled();
  });

  it('não confunde /sales/summary com /sales/:id', async () => {
    arrangeVerifiedStore();
    saleGroupBy.mockResolvedValue([]);
    saleItemFindMany.mockResolvedValue([]);

    const response = await request('GET', `/sales/summary${QUERY}`);

    expect(response.statusCode).toBe(200);
    expect(saleFindFirst).not.toHaveBeenCalled();
  });
});

describe('GET /sales/:id', () => {
  it('devolve o detalhe com os itens e sem custo', async () => {
    arrangeVerifiedStore();
    saleFindFirst.mockResolvedValue(buildSaleRow());

    const response = await request('GET', `/sales/${SALE_ID}`);

    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(1);
    expect(JSON.stringify(response.json())).not.toMatch(/cost|profit|margin/i);
    expect(saleFindFirst.mock.calls[0][0].where).toEqual({ id: SALE_ID, storeId: 'store-1' });
  });

  it('venda de um produto que foi removido da loja: storeProductId null, histórico preservado', async () => {
    arrangeVerifiedStore();
    saleFindFirst.mockResolvedValue(
      buildSaleRow({
        items: [
          {
            id: 'item-1',
            saleId: SALE_ID,
            storeProductId: null,
            productName: 'Kaiak Aventura 100 ml',
            productImageSm: null,
            quantity: 1,
            unitPrice: money(55),
            unitCost: null,
          },
        ],
      }),
    );

    const response = await request('GET', `/sales/${SALE_ID}`);

    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      storeProductId: null,
      productName: 'Kaiak Aventura 100 ml',
      productImageSm: null,
      unitPrice: 55,
      subtotal: 55,
    });
  });

  it('404 "Venda não encontrada." quando não existe (ou é de outra loja)', async () => {
    arrangeVerifiedStore();
    saleFindFirst.mockResolvedValue(null);

    const response = await request('GET', `/sales/${SALE_ID}`);

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Venda não encontrada.');
  });

  it('400 para id que não é UUID', async () => {
    arrangeVerifiedStore();

    const response = await request('GET', '/sales/123');

    expect(response.statusCode).toBe(400);
  });
});

describe('PATCH /sales/:id', () => {
  it('marca a pendente como paga: UPDATE só casa pending e devolve a venda paga', async () => {
    arrangeVerifiedStore();
    saleUpdateMany.mockResolvedValue({ count: 1 });
    saleFindFirst.mockResolvedValue(buildSaleRow({ status: 'paid', paymentMethod: 'on_account' }));

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'paid' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('paid');
    expect(saleUpdateMany).toHaveBeenCalledWith({
      where: { id: SALE_ID, storeId: 'store-1', status: 'pending' },
      data: { status: 'paid' },
    });
  });

  it('é idempotente: repetir em venda já paga devolve 200 igual', async () => {
    arrangeVerifiedStore();
    saleUpdateMany.mockResolvedValue({ count: 0 }); // nada a atualizar
    saleFindFirst.mockResolvedValue(buildSaleRow({ status: 'paid' }));

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'paid' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('paid');
  });

  it('404 quando a venda não existe nesta loja', async () => {
    arrangeVerifiedStore();
    saleUpdateMany.mockResolvedValue({ count: 0 });
    saleFindFirst.mockResolvedValue(null);

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'paid' });

    expect(response.statusCode).toBe(404);
  });

  it('venda CANCELADA não vira paga: 409', async () => {
    arrangeVerifiedStore();
    saleUpdateMany.mockResolvedValue({ count: 0 });
    saleFindFirst.mockResolvedValue(buildSaleRow({ status: 'cancelled' }));

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'paid' });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      'Esta venda foi cancelada e não pode ser marcada como paga.',
    );
  });

  it.each([
    ['status pending (não dá para "despagar")', { status: 'pending' }],
    ['status inválido', { status: 'refunded' }],
    ['body vazio', {}],
  ])('400 para %s', async (_label, body) => {
    arrangeVerifiedStore();

    const response = await request('PATCH', `/sales/${SALE_ID}`, body);

    expect(response.statusCode).toBe(400);
    expect(saleUpdateMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /sales/:id { status: "cancelled" } (cancela o pedido e devolve o estoque)', () => {
  const PRODUCT_C = '55555555-5555-4555-8555-555555555555';

  function arrangeCancel({
    count,
    finalStatus,
    items = [
      { storeProductId: PRODUCT_A, quantity: 2, components: [] },
      { storeProductId: PRODUCT_B, quantity: 1, components: [] },
    ],
  }: {
    count: number;
    finalStatus: string;
    items?: { storeProductId: string | null; quantity: number; components?: unknown[] }[];
  }) {
    arrangeVerifiedStore();
    txSaleUpdateMany.mockResolvedValue({ count });
    txSaleItemFindMany.mockResolvedValue(items.map((item) => ({ components: [], ...item })));
    txStoreProductUpdateMany.mockResolvedValue({ count: 1 });
    txSaleFindFirst.mockResolvedValue(
      buildSaleRow({ status: finalStatus, source: 'online', customerWhatsapp: '5511987654321' }),
    );
  }

  it('cancela o pedido PENDENTE: 200 com status cancelled', async () => {
    arrangeCancel({ count: 1, finalStatus: 'cancelled' });

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'cancelled' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('cancelled');
    expect(txSaleUpdateMany).toHaveBeenCalledWith({
      where: { id: SALE_ID, storeId: 'store-1', status: 'pending' },
      data: { status: 'cancelled' },
    });
  });

  it('DEVOLVE o estoque de cada item, na loja e em ordem estável (por id)', async () => {
    // Fora de ordem de propósito: o repositório ordena por id.
    arrangeCancel({
      count: 1,
      finalStatus: 'cancelled',
      items: [
        { storeProductId: PRODUCT_B, quantity: 1 },
        { storeProductId: PRODUCT_A, quantity: 2 },
      ],
    });

    await request('PATCH', `/sales/${SALE_ID}`, { status: 'cancelled' });

    expect(txStoreProductUpdateMany.mock.calls).toEqual([
      [
        {
          where: { id: PRODUCT_A, storeId: 'store-1' },
          data: { stock: { increment: 2 } },
        },
      ],
      [
        {
          where: { id: PRODUCT_B, storeId: 'store-1' },
          data: { stock: { increment: 1 } },
        },
      ],
    ]);
  });

  it('busca TODOS os itens da venda, mesmo o que já perdeu o produto (os componentes de kit dele podem continuar valendo)', async () => {
    arrangeCancel({ count: 1, finalStatus: 'cancelled' });

    await request('PATCH', `/sales/${SALE_ID}`, { status: 'cancelled' });

    // Sem filtro por `storeProductId`: um item cujo produto saiu da loja não tem estoque próprio pra
    // devolver, mas os componentes dele (se era um kit) têm FK independente e continuam restaurados.
    expect(txSaleItemFindMany.mock.calls[0][0].where).toEqual({ saleId: SALE_ID });
  });

  it('é idempotente: cancelar de novo devolve 200 e NÃO devolve o estoque outra vez', async () => {
    arrangeCancel({ count: 0, finalStatus: 'cancelled' });

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'cancelled' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('cancelled');
    expect(txSaleItemFindMany).not.toHaveBeenCalled();
    expect(txStoreProductUpdateMany).not.toHaveBeenCalled();
  });

  it('venda PAGA não cancela: 409 e o estoque não é mexido', async () => {
    arrangeCancel({ count: 0, finalStatus: 'paid' });

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'cancelled' });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe('Uma venda já paga não pode ser cancelada.');
    expect(txStoreProductUpdateMany).not.toHaveBeenCalled();
  });

  it('404 quando a venda não existe nesta loja (ou é de outra)', async () => {
    arrangeVerifiedStore();
    txSaleUpdateMany.mockResolvedValue({ count: 0 });
    txSaleFindFirst.mockResolvedValue(null);

    const response = await request('PATCH', `/sales/${SALE_ID}`, { status: 'cancelled' });

    expect(response.statusCode).toBe(404);
    expect(txSaleFindFirst.mock.calls[0][0].where).toEqual({ id: SALE_ID, storeId: 'store-1' });
  });

  it('quantidade devolvida vem só dos itens da venda (a venda inteira, sem tocar outra loja)', async () => {
    arrangeCancel({
      count: 1,
      finalStatus: 'cancelled',
      items: [{ storeProductId: PRODUCT_C, quantity: 5 }],
    });

    await request('PATCH', `/sales/${SALE_ID}`, { status: 'cancelled' });

    expect(txStoreProductUpdateMany).toHaveBeenCalledTimes(1);
    expect(txStoreProductUpdateMany.mock.calls[0][0].where.storeId).toBe('store-1');
  });

  it('a lista aceita filtrar por status=cancelled', async () => {
    arrangeVerifiedStore();
    saleFindMany.mockResolvedValue([]);
    saleCount.mockResolvedValue(0);

    const response = await request('GET', '/sales?status=cancelled');

    expect(response.statusCode).toBe(200);
    expect(saleFindMany.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      status: 'cancelled',
    });
  });
});

describe('GET /sales/top-products', () => {
  it('soma quantidade e receita por produto (vendas pagas do período), ranking por quantidade', async () => {
    arrangeVerifiedStore();
    saleItemFindMany.mockResolvedValue([
      { storeProductId: PRODUCT_A, quantity: 2, unitPrice: money(55) },
      { storeProductId: PRODUCT_A, quantity: 1, unitPrice: money(55) },
      { storeProductId: PRODUCT_B, quantity: 5, unitPrice: money(20) },
    ]);
    storeProductFindMany.mockResolvedValue([
      {
        id: PRODUCT_A,
        name: null,
        image: null,
        product: { name: 'Kaiak', productImageSm: 'https://img/k.jpg' },
      },
      {
        id: PRODUCT_B,
        name: null,
        image: null,
        product: { name: 'Água de Cheiro', productImageSm: null },
      },
    ]);

    const response = await request(
      'GET',
      '/sales/top-products?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z',
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          storeProductId: PRODUCT_B,
          name: 'Água de Cheiro',
          image: null,
          quantitySold: 5,
          revenue: 100,
        },
        {
          storeProductId: PRODUCT_A,
          name: 'Kaiak',
          image: 'https://img/k.jpg',
          quantitySold: 3,
          revenue: 165,
        },
      ],
    });
  });

  it('respeita o limit (corta o ranking antes de buscar nome/imagem)', async () => {
    arrangeVerifiedStore();
    saleItemFindMany.mockResolvedValue([
      { storeProductId: PRODUCT_A, quantity: 2, unitPrice: money(55) },
      { storeProductId: PRODUCT_B, quantity: 5, unitPrice: money(20) },
    ]);
    storeProductFindMany.mockResolvedValue([
      {
        id: PRODUCT_B,
        name: null,
        image: null,
        product: { name: 'Água de Cheiro', productImageSm: null },
      },
    ]);

    const response = await request(
      'GET',
      '/sales/top-products?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&limit=1',
    );

    expect(response.json().items).toHaveLength(1);
    expect(storeProductFindMany.mock.calls[0][0].where.id.in).toEqual([PRODUCT_B]);
  });

  it('400 quando from não é anterior a to', async () => {
    arrangeVerifiedStore();

    const response = await request(
      'GET',
      '/sales/top-products?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z',
    );

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /sales/stale-products', () => {
  it('lista produtos com estoque > 0 sem venda paga recente, com a última venda quando existir', async () => {
    arrangeVerifiedStore();
    storeProductFindMany.mockResolvedValue([
      {
        id: PRODUCT_A,
        stock: 12,
        price: money(55),
        name: null,
        image: null,
        product: { name: 'Kaiak', productImageSm: 'https://img/k.jpg' },
      },
      {
        id: PRODUCT_B,
        stock: 3,
        price: money(20),
        name: 'Cesta de Presente',
        image: null,
        product: null,
      },
    ]);
    saleItemFindMany.mockResolvedValue([
      { storeProductId: PRODUCT_A, sale: { createdAt: new Date('2026-08-01T00:00:00.000Z') } },
    ]);

    const response = await request('GET', '/sales/stale-products');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          storeProductId: PRODUCT_A,
          name: 'Kaiak',
          image: 'https://img/k.jpg',
          stock: 12,
          price: 55,
          lastSoldAt: '2026-08-01T00:00:00.000Z',
        },
        {
          storeProductId: PRODUCT_B,
          name: 'Cesta de Presente',
          image: null,
          stock: 3,
          price: 20,
          lastSoldAt: null,
        },
      ],
    });
  });

  it('filtra por estoque > 0 e "sem venda paga desde o corte" (dias)', async () => {
    arrangeVerifiedStore();
    storeProductFindMany.mockResolvedValue([]);

    await request('GET', '/sales/stale-products?days=60');

    const where = storeProductFindMany.mock.calls[0][0].where;
    expect(where.storeId).toBe('store-1');
    expect(where.stock).toEqual({ gt: 0 });
    expect(where.saleItems.none.sale.status).toBe('paid');
  });
});

describe('GET /sales/timeline', () => {
  const QUERY =
    '?from=2026-01-01T03:00:00.000Z&to=2026-03-01T03:00:00.000Z&groupBy=month&tzOffsetMinutes=-180';

  it('devolve receita e custo por mês (só vendas pagas), com meses vazios zerados', async () => {
    arrangeVerifiedStore();
    saleFindMany.mockResolvedValue([
      {
        createdAt: new Date('2026-01-15T12:00:00.000Z'),
        total: money(200),
        items: [
          { unitCost: money(30), quantity: 2 },
          { unitCost: null, quantity: 1 },
        ],
      },
    ]);

    const response = await request('GET', `/sales/timeline${QUERY}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      groupBy: 'month',
      costIsPartial: true,
      items: [
        { periodStart: '2026-01-01T03:00:00.000Z', revenue: 200, cost: 60 },
        { periodStart: '2026-02-01T03:00:00.000Z', revenue: 0, cost: 0 },
      ],
    });
    expect(saleFindMany.mock.calls[0][0].where).toEqual({
      storeId: 'store-1',
      status: 'paid',
      createdAt: {
        gte: new Date('2026-01-01T03:00:00.000Z'),
        lt: new Date('2026-03-01T03:00:00.000Z'),
      },
    });
  });

  it.each([
    ['sem período', ''],
    ['from depois de to', '?from=2026-03-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z'],
    ['período maior que 366 dias', '?from=2025-01-01T00:00:00.000Z&to=2026-06-01T00:00:00.000Z'],
    ['groupBy inválido', '?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z&groupBy=year'],
  ])('retorna 400 %s', async (_label, query) => {
    arrangeVerifiedStore();

    const response = await request('GET', `/sales/timeline${query}`);

    expect(response.statusCode).toBe(400);
    expect(saleFindMany).not.toHaveBeenCalled();
  });

  it('retorna 401 sem token', async () => {
    const response = await request('GET', `/sales/timeline${QUERY}`, undefined, null);

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /sales/top-brands', () => {
  const QUERY = '?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z';
  const item = (
    quantity: number,
    price: number,
    brand: { id: number; name: string; logo: string | null } | null,
  ) => ({
    quantity,
    unitPrice: money(price),
    storeProduct: { product: brand ? { brand } : null },
  });

  it('soma quantidade e receita por marca (vendas pagas), ranking por quantidade; ignora produto sem marca', async () => {
    arrangeVerifiedStore();
    saleItemFindMany.mockResolvedValue([
      item(2, 55, { id: 1, name: 'Natura', logo: 'https://img/natura.png' }),
      item(1, 55, { id: 1, name: 'Natura', logo: 'https://img/natura.png' }),
      item(5, 20, { id: 2, name: 'Boticario', logo: null }),
      item(9, 10, null), // produto manual: sem marca
    ]);

    const response = await request('GET', `/sales/top-brands${QUERY}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        { brandId: 2, name: 'Boticario', logo: null, quantitySold: 5, revenue: 100 },
        {
          brandId: 1,
          name: 'Natura',
          logo: 'https://img/natura.png',
          quantitySold: 3,
          revenue: 165,
        },
      ],
    });
    expect(saleItemFindMany.mock.calls[0][0].where).toEqual({
      sale: {
        storeId: 'store-1',
        status: 'paid',
        createdAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lt: new Date('2026-10-01T00:00:00.000Z'),
        },
      },
      storeProductId: { not: null },
    });
  });

  it('respeita o limit', async () => {
    arrangeVerifiedStore();
    saleItemFindMany.mockResolvedValue([
      item(2, 55, { id: 1, name: 'Natura', logo: null }),
      item(5, 20, { id: 2, name: 'Boticario', logo: null }),
    ]);

    const response = await request('GET', `/sales/top-brands${QUERY}&limit=1`);

    expect(response.json().items).toEqual([
      { brandId: 2, name: 'Boticario', logo: null, quantitySold: 5, revenue: 100 },
    ]);
  });

  it.each([
    ['sem período', ''],
    ['from depois de to', '?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z'],
    ['limit acima do máximo', `${QUERY}&limit=21`],
  ])('retorna 400 %s', async (_label, query) => {
    arrangeVerifiedStore();

    const response = await request('GET', `/sales/top-brands${query}`);

    expect(response.statusCode).toBe(400);
    expect(saleItemFindMany).not.toHaveBeenCalled();
  });

  it('retorna 401 sem token', async () => {
    const response = await request('GET', `/sales/top-brands${QUERY}`, undefined, null);

    expect(response.statusCode).toBe(401);
  });
});
