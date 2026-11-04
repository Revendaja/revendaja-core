import { aiQueries } from '../ai.queries';
import { catalogService } from '../../catalog/catalog.service';
import { storeService } from '../../store/store.service';
import { addToStockTool, adjustStockTool } from '../tools/write.tools';
import { TOOL_DEFINITIONS, getTool } from '../tools';

jest.mock('../ai.queries', () => ({
  aiQueries: { storeProductIdsByCatalogId: jest.fn(), findStockRow: jest.fn() },
}));
jest.mock('../../catalog/catalog.service', () => ({ catalogService: { getProduct: jest.fn() } }));
jest.mock('../../store/store.service', () => ({
  storeService: { addProduct: jest.fn(), updateProduct: jest.fn() },
}));

const queries = aiQueries as jest.Mocked<typeof aiQueries>;
const catalog = catalogService as jest.Mocked<typeof catalogService>;
const store = storeService as jest.Mocked<typeof storeService>;

const CTX = { userId: 'user-1', storeId: 'store-1', conversationId: 'conv-1' };
const SP_ID = '8c5f7a52-1a0f-4a45-9a52-3d0a9f1b2c11';

const catalogProduct = {
  id: 10,
  name: 'Egeo Tradicional',
  brand: { id: 1, name: 'O Boticário', logo: null, profitability: 0 },
  productImageSm: 'https://img/egeo.png',
  productImage: null,
  basePrice: 129.9,
} as never;

function stockRow(stock: number) {
  return {
    storeProductId: SP_ID,
    name: 'Una',
    brand: 'Natura',
    image: null,
    stock,
    minStock: 0,
    price: 99,
    effectivePrice: 99,
    costPrice: null,
  };
}

describe('propose_add_to_stock', () => {
  it('sem preço usa o sugerido do catálogo e descreve a operação', async () => {
    catalog.getProduct.mockResolvedValue(catalogProduct);
    queries.storeProductIdsByCatalogId.mockResolvedValue(new Map());

    const prepared = await addToStockTool.prepare(CTX, { productId: 10, quantity: 5 });

    expect(prepared.summary).toContain('Egeo Tradicional');
    expect(prepared.summary).toContain('5 unidade(s)');
    expect(prepared.summary).toContain('preço sugerido do catálogo');
    expect(prepared.payload).toMatchObject({ productId: 10, quantity: 5, price: 129.9 });
    // Preparar não grava nada.
    expect(store.addProduct).not.toHaveBeenCalled();
  });

  it('produto que já está na loja é recusado, apontando para o ajuste de estoque', async () => {
    catalog.getProduct.mockResolvedValue(catalogProduct);
    queries.storeProductIdsByCatalogId.mockResolvedValue(new Map([[10, SP_ID]]));

    await expect(addToStockTool.prepare(CTX, { productId: 10, quantity: 5 })).rejects.toThrow(
      /propose_adjust_stock/,
    );
  });

  it('apply cadastra pelo service existente (com as regras de plano), usando só o payload', async () => {
    store.addProduct.mockResolvedValue({ id: SP_ID, stock: 5, price: 129.9 } as never);

    const result = await addToStockTool.apply(CTX, { productId: 10, quantity: 5, price: 129.9 });

    expect(store.addProduct).toHaveBeenCalledWith('user-1', {
      productId: 10,
      price: 129.9,
      costPrice: null,
      stock: 5,
    });
    expect(result).toEqual({ storeProductId: SP_ID, stock: 5, price: 129.9 });
  });

  it('payload adulterado no banco é recusado na execução', async () => {
    await expect(addToStockTool.apply(CTX, { productId: 10, quantity: -3 })).rejects.toThrow();
    expect(store.addProduct).not.toHaveBeenCalled();
  });
});

describe('propose_adjust_stock', () => {
  it('remover mais do que existe é recusado', async () => {
    queries.findStockRow.mockResolvedValue(stockRow(3));

    await expect(
      adjustStockTool.prepare(CTX, { storeProductId: SP_ID, mode: 'remove', quantity: 5 }),
    ).rejects.toThrow(/não dá para remover 5/);
  });

  it('busca o produto sempre pela loja da usuária', async () => {
    queries.findStockRow.mockResolvedValue(null);

    await expect(
      adjustStockTool.prepare(CTX, { storeProductId: SP_ID, mode: 'add', quantity: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(queries.findStockRow).toHaveBeenCalledWith('store-1', SP_ID);
  });

  it('descreve o antes e o depois e guarda o estoque visto', async () => {
    queries.findStockRow.mockResolvedValue(stockRow(10));

    const prepared = await adjustStockTool.prepare(CTX, {
      storeProductId: SP_ID,
      mode: 'remove',
      quantity: 2,
    });

    expect(prepared.summary).toContain('de 10 para 8');
    expect(prepared.payload).toMatchObject({ expectedCurrentStock: 10 });
  });

  it('apply recusa se o estoque mudou desde a proposta (ex.: uma venda no meio)', async () => {
    queries.findStockRow.mockResolvedValue(stockRow(7));

    await expect(
      adjustStockTool.apply(CTX, {
        storeProductId: SP_ID,
        mode: 'remove',
        quantity: 2,
        expectedCurrentStock: 10,
      }),
    ).rejects.toThrow(/mudou desde o pedido/);
    expect(store.updateProduct).not.toHaveBeenCalled();
  });

  it('apply grava o novo estoque pelo service existente', async () => {
    queries.findStockRow.mockResolvedValue(stockRow(10));
    store.updateProduct.mockResolvedValue({ id: SP_ID, stock: 8 } as never);

    const result = await adjustStockTool.apply(CTX, {
      storeProductId: SP_ID,
      mode: 'remove',
      quantity: 2,
      expectedCurrentStock: 10,
    });

    expect(store.updateProduct).toHaveBeenCalledWith('user-1', SP_ID, { stock: 8 });
    expect(result).toEqual({ storeProductId: SP_ID, previousStock: 10, stock: 8 });
  });
});

describe('registro de ferramentas', () => {
  it('gera uma definição por ferramenta, com schema de objeto', () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_catalog',
        'search_my_stock',
        'get_stale_products',
        'get_finance_summary',
        'get_top_products',
        'get_stock_value',
        'propose_add_to_stock',
        'propose_adjust_stock',
      ]),
    );
    for (const definition of TOOL_DEFINITIONS) {
      expect(definition.type).toBe('function');
      expect(definition.parameters?.type).toBe('object');
      expect((definition.description ?? '').length).toBeGreaterThan(20);
    }
  });

  it('nenhuma ferramenta recebe loja ou usuária do modelo', () => {
    for (const definition of TOOL_DEFINITIONS) {
      const properties = Object.keys(
        (definition.parameters as { properties?: Record<string, unknown> }).properties ?? {},
      );
      expect(properties).not.toEqual(expect.arrayContaining(['storeId']));
      expect(properties).not.toEqual(expect.arrayContaining(['userId']));
    }
  });

  it('ferramentas de escrita se chamam propose_* e as de leitura não escrevem', () => {
    for (const name of ['propose_add_to_stock', 'propose_adjust_stock']) {
      expect(getTool(name)?.kind).toBe('write');
    }
    expect(getTool('search_catalog')?.kind).toBe('read');
  });
});
