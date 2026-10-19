import { buildTestSession, signTestAccessToken } from '../../../../test/helpers/token';

const sessionFindUnique = jest.fn();
const brandFindMany = jest.fn();
const productFindMany = jest.fn();
const productCount = jest.fn();
const productFindUnique = jest.fn();
const queryRaw = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: {
    session: {
      findUnique: (...args: unknown[]) => sessionFindUnique(...args),
    },
    brand: {
      findMany: (...args: unknown[]) => brandFindMany(...args),
    },
    product: {
      findMany: (...args: unknown[]) => productFindMany(...args),
      count: (...args: unknown[]) => productCount(...args),
      findUnique: (...args: unknown[]) => productFindUnique(...args),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { buildApp } from '../../../app';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const TOKEN = signTestAccessToken(USER_ID);

function buildProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Desodorante Colônia',
    barCode: null,
    brandSku: '123',
    description: null,
    productImage: null,
    productImageSm: null,
    brandId: 1,
    basePrice: { toNumber: () => 99.9 },
    brand: { id: 1, name: 'Natura', logo: null, profitability: 30 },
    ...overrides,
  };
}

beforeEach(() => {
  sessionFindUnique.mockReset();
  sessionFindUnique.mockResolvedValue(buildTestSession(USER_ID));
  brandFindMany.mockReset();
  productFindMany.mockReset();
  productCount.mockReset();
  productFindUnique.mockReset();
  queryRaw.mockReset();
});

describe('GET /catalog/products', () => {
  it('retorna 401 sem token de autenticação', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/catalog/products' });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('lista produtos paginados do catálogo', async () => {
    productFindMany.mockResolvedValue([buildProductRow()]);
    productCount.mockResolvedValue(1);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/products',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].basePrice).toBe(99.9);
    expect(body.items[0].brand.name).toBe('Natura');

    await app.close();
  });

  describe('busca (search)', () => {
    async function search(query: string) {
      productFindMany.mockResolvedValue([buildProductRow()]);
      productCount.mockResolvedValue(1);
      // Busca por nome vira "quais ids combinam por similaridade" (ver catalog.search.ts):
      // o id 1 aqui é só pra bater com `buildProductRow()`, não importa pro que os testes checam.
      queryRaw.mockResolvedValue([{ id: 1 }]);

      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: `/catalog/products?${query}`,
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      await app.close();
      return response;
    }

    it('busca por nome: só filtra pelos ids que combinam por similaridade', async () => {
      const response = await search('search=kaiak');

      expect(response.statusCode).toBe(200);
      const where = productFindMany.mock.calls[0][0].where;
      expect(where).toEqual({ id: { in: [1] } });
    });

    it('busca por código de barras (13 dígitos): nome (similaridade) OU código exato', async () => {
      const response = await search('search=7899952323991');

      expect(response.statusCode).toBe(200);
      const where = productFindMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { id: { in: [1] } },
        { barCode: { in: expect.arrayContaining(['7899952323991', '07899952323991']) } },
      ]);
    });

    it('o total usa o mesmo filtro da listagem (paginação coerente)', async () => {
      await search('search=7899952323991');

      expect(productCount.mock.calls[0][0].where).toEqual(productFindMany.mock.calls[0][0].where);
    });

    it('código de barras + marca: filtra pela marca E pelo (nome OU código)', async () => {
      await search('search=7899952323991&brandId=4');

      const where = productFindMany.mock.calls[0][0].where;
      expect(where.brandId).toBe(4);
      expect(where.OR).toHaveLength(2);
    });

    it('espaços em volta do código são ignorados (trim do schema)', async () => {
      await search('search=%207899952323991%20');

      const where = productFindMany.mock.calls[0][0].where;
      expect(where.OR[1]).toEqual({
        barCode: { in: expect.arrayContaining(['7899952323991']) },
      });
    });

    it('número curto não vira busca por código de barras', async () => {
      await search('search=12');

      const where = productFindMany.mock.calls[0][0].where;
      expect(where).toEqual({ id: { in: [1] } });
    });
  });
});

describe('GET /catalog/products/:id', () => {
  it('retorna 404 quando o produto não existe', async () => {
    productFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/products/999',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('retorna o produto quando ele existe', async () => {
    productFindUnique.mockResolvedValue(buildProductRow());

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/products/1',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(1);

    await app.close();
  });
});

describe('GET /catalog/brands', () => {
  it('lista as marcas do catálogo', async () => {
    brandFindMany.mockResolvedValue([{ id: 1, name: 'Natura', logo: null, profitability: 30 }]);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/catalog/brands',
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 1, name: 'Natura', logo: null, profitability: 30 }]);

    await app.close();
  });
});
