import { aiQueries } from '../ai.queries';
import { salesService } from '../../sales/sales.service';
import { storeRepository } from '../../store/store.repository';
import { storeService } from '../../store/store.service';
import { cancelSaleTool, markSalePaidTool, registerSaleTool } from '../tools/sales.tools';
import { createCategoryTool, removeProductTool, updateProductTool } from '../tools/store.tools';
import { AI_TOOLS, TOOL_DEFINITIONS } from '../tools';

jest.mock('../ai.queries', () => ({
  aiQueries: { findStockRow: jest.fn(), findSaleIdByNumber: jest.fn() },
}));
jest.mock('../../sales/sales.service', () => ({
  salesService: { create: jest.fn(), get: jest.fn(), markPaid: jest.fn(), cancel: jest.fn() },
}));
jest.mock('../../store/store.service', () => ({
  storeService: { updateProduct: jest.fn(), removeProduct: jest.fn() },
}));
jest.mock('../../store/store.repository', () => ({
  storeRepository: { findByUserId: jest.fn() },
}));
jest.mock('../../home/home.service', () => ({ homeService: {} }));
jest.mock('../../catalog/catalog.service', () => ({ catalogService: {} }));

const queries = aiQueries as jest.Mocked<typeof aiQueries>;
const sales = salesService as jest.Mocked<typeof salesService>;
const stores = storeRepository as jest.Mocked<typeof storeRepository>;
const store = storeService as jest.Mocked<typeof storeService>;

const CTX = { userId: 'user-1', storeId: 'store-1', conversationId: 'conv-1' };
const SP_A = '8c5f7a52-1a0f-4a45-9a52-3d0a9f1b2c11';
const SP_B = '5d3e2b10-7c1f-4b77-8f2a-0a6b3c9d1e22';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function row(overrides: Partial<Awaited<ReturnType<typeof aiQueries.findStockRow>>> = {}) {
  return {
    storeProductId: SP_A,
    name: 'Una',
    brand: 'Natura',
    image: null,
    stock: 10,
    minStock: 0,
    price: 100,
    effectivePrice: 100,
    costPrice: null,
    ...overrides,
  };
}

function setPlan(plan: 'free' | 'starter') {
  stores.findByUserId.mockResolvedValue({ id: 'store-1', userId: 'user-1', plan } as never);
}

function sale(status: 'paid' | 'pending' | 'cancelled') {
  return { id: 'sale-1', number: 42, customerName: 'Maria', status, total: 250 } as never;
}

beforeEach(() => {
  setPlan('starter');
});

describe('propose_register_sale', () => {
  const input = {
    customerName: 'Maria',
    paymentMethod: 'pix' as const,
    items: [{ storeProductId: SP_A, quantity: 2 }],
  };

  it('calcula o total com o preço vigente (promoção incluída) e gera o id de idempotência', async () => {
    queries.findStockRow.mockResolvedValue(row({ price: 100, effectivePrice: 80 }));

    const prepared = await registerSaleTool.prepare(CTX, input);

    expect(prepared.summary).toContain('Maria');
    expect(prepared.summary).toContain('2x Una');
    expect(prepared.summary).toContain('160,00');
    expect((prepared.payload as { clientRequestId: string }).clientRequestId).toMatch(UUID);
    expect(sales.create).not.toHaveBeenCalled();
  });

  it('recusa produto repetido e estoque insuficiente', async () => {
    await expect(
      registerSaleTool.prepare(CTX, {
        ...input,
        items: [
          { storeProductId: SP_A, quantity: 1 },
          { storeProductId: SP_A, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_SALE_ITEM' });

    queries.findStockRow.mockResolvedValue(row({ stock: 1 }));
    await expect(registerSaleTool.prepare(CTX, input)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
  });

  it('produto de outra loja não é encontrado', async () => {
    queries.findStockRow.mockResolvedValue(null);
    await expect(registerSaleTool.prepare(CTX, input)).rejects.toMatchObject({ statusCode: 404 });
    expect(queries.findStockRow).toHaveBeenCalledWith('store-1', SP_A);
  });

  it('parcelas só valem no cartão', () => {
    expect(registerSaleTool.input.safeParse({ ...input, installments: 3 }).success).toBe(false);
    expect(
      registerSaleTool.input.safeParse({ ...input, paymentMethod: 'card', installments: 3 })
        .success,
    ).toBe(true);
  });

  it('apply repete o MESMO clientRequestId da proposta (venda nunca duplica)', async () => {
    sales.create.mockResolvedValue({ sale: { number: 7, total: 160 }, created: true } as never);
    const clientRequestId = '3f1c6d2e-6a53-4d1d-9a89-1d8a2c3b4f5a';

    const result = await registerSaleTool.apply(CTX, { ...input, clientRequestId });

    expect(sales.create).toHaveBeenCalledWith('user-1', {
      clientRequestId,
      customerName: 'Maria',
      paymentMethod: 'pix',
      installments: null,
      items: input.items,
    });
    expect(result).toEqual({ saleNumber: 7, total: 160 });
  });
});

describe('propose_mark_sale_paid / propose_cancel_sale', () => {
  beforeEach(() => {
    queries.findSaleIdByNumber.mockResolvedValue('sale-1');
  });

  it('marcar como paga: só vale para venda pendente', async () => {
    sales.get.mockResolvedValue(sale('paid'));
    await expect(markSalePaidTool.prepare(CTX, { saleNumber: 42 })).rejects.toMatchObject({
      code: 'ALREADY_PAID',
    });

    sales.get.mockResolvedValue(sale('cancelled'));
    await expect(markSalePaidTool.prepare(CTX, { saleNumber: 42 })).rejects.toMatchObject({
      code: 'SALE_CANCELLED',
    });

    sales.get.mockResolvedValue(sale('pending'));
    const prepared = await markSalePaidTool.prepare(CTX, { saleNumber: 42 });
    expect(prepared.summary).toContain('#42');
    expect(sales.markPaid).not.toHaveBeenCalled();
  });

  it('cancelar: venda paga não cancela', async () => {
    sales.get.mockResolvedValue(sale('paid'));
    await expect(cancelSaleTool.prepare(CTX, { saleNumber: 42 })).rejects.toMatchObject({
      code: 'SALE_PAID',
    });
  });

  it('venda que não existe na loja responde 404', async () => {
    queries.findSaleIdByNumber.mockResolvedValue(null);
    await expect(markSalePaidTool.prepare(CTX, { saleNumber: 999 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(queries.findSaleIdByNumber).toHaveBeenCalledWith('store-1', 999);
  });

  it('apply usa o id gravado na proposta', async () => {
    sales.markPaid.mockResolvedValue({ number: 42, status: 'paid' } as never);
    await markSalePaidTool.apply(CTX, { saleId: SP_A, saleNumber: 42 });
    expect(sales.markPaid).toHaveBeenCalledWith('user-1', SP_A);
  });
});

describe('propose_update_product', () => {
  beforeEach(() => {
    queries.findStockRow.mockResolvedValue(row());
  });

  it('sem mudança de verdade é recusado', async () => {
    await expect(
      updateProductTool.prepare(CTX, { storeProductId: SP_A, price: 100 }),
    ).rejects.toMatchObject({ code: 'NO_CHANGE' });
  });

  it('descreve o antes e o depois do preço', async () => {
    const prepared = await updateProductTool.prepare(CTX, { storeProductId: SP_A, price: 120 });
    expect(prepared.summary).toContain('100,00');
    expect(prepared.summary).toContain('120,00');
  });

  it('promoção exige os dias, ser menor que o preço e plano que libere', async () => {
    await expect(
      updateProductTool.prepare(CTX, { storeProductId: SP_A, promoPrice: 80 }),
    ).rejects.toMatchObject({ code: 'MISSING_PROMO_DAYS' });

    await expect(
      updateProductTool.prepare(CTX, { storeProductId: SP_A, promoPrice: 100, promoDays: 7 }),
    ).rejects.toMatchObject({ code: 'INVALID_PROMO_PRICE' });

    setPlan('free');
    await expect(
      updateProductTool.prepare(CTX, { storeProductId: SP_A, promoPrice: 80, promoDays: 7 }),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });

  it('apply remove a promoção com os dois campos nulos e define a validade como data', async () => {
    store.updateProduct.mockResolvedValue({ id: SP_A, price: 100, isActive: true } as never);

    await updateProductTool.apply(CTX, { storeProductId: SP_A, clearPromo: true });
    expect(store.updateProduct).toHaveBeenLastCalledWith('user-1', SP_A, {
      promoPrice: null,
      promoEndsAt: null,
    });

    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    await updateProductTool.apply(CTX, {
      storeProductId: SP_A,
      promoPrice: 80,
      promoEndsAt: endsAt,
    });
    expect(store.updateProduct).toHaveBeenLastCalledWith('user-1', SP_A, {
      promoPrice: 80,
      promoEndsAt: new Date(endsAt),
    });
  });
});

describe('outras alterações da loja', () => {
  it('remover produto avisa que não dá para desfazer', async () => {
    queries.findStockRow.mockResolvedValue(row({ stock: 4 }));
    const prepared = await removeProductTool.prepare(CTX, { storeProductId: SP_B });
    expect(prepared.summary).toContain('Não dá para desfazer');
    expect(prepared.summary).toContain('4 unidade');
    expect(store.removeProduct).not.toHaveBeenCalled();
  });

  it('categoria no plano Gratuito é recusada já na proposta', async () => {
    setPlan('free');
    await expect(createCategoryTool.prepare(CTX, { name: 'Perfumes' })).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
  });
});

describe('cobertura do assistente', () => {
  it('todas as ferramentas geram definição válida e nomes são únicos', () => {
    const names = AI_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(TOOL_DEFINITIONS).toHaveLength(names.length);
  });

  it('toda escrita é uma proposta (propose_*) e nada de escrita se chama como leitura', () => {
    for (const tool of AI_TOOLS) {
      expect(tool.kind === 'write').toBe(tool.name.startsWith('propose_'));
    }
  });

  it('cobre vendas, clientes, loja, planos e metas', () => {
    const names = AI_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_sales',
        'get_customers',
        'get_customer_history',
        'get_home_overview',
        'get_store_info',
        'get_plan_features',
        'propose_register_sale',
        'propose_mark_sale_paid',
        'propose_cancel_sale',
        'propose_update_product',
        'propose_set_monthly_goal',
        'propose_update_store_settings',
      ]),
    );
  });
});
