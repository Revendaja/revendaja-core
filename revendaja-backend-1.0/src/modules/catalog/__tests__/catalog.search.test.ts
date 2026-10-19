import { prisma } from '../../../database/prisma';
import { barcodeCandidates, buildProductSearchFilter, findFuzzyProductIds } from '../catalog.search';

jest.mock('../../../database/prisma', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

const queryRawMock = prisma.$queryRaw as unknown as jest.Mock;

beforeEach(() => {
  queryRawMock.mockReset();
});

describe('barcodeCandidates', () => {
  it('EAN-13 comum: o próprio código e a forma GTIN-14 (com 0 na frente)', () => {
    expect(barcodeCandidates('7899952323991').sort()).toEqual(
      ['7899952323991', '07899952323991'].sort(),
    );
  });

  it('UPC-A de 12 dígitos: acha também o EAN-13 e o GTIN-14 com zeros na frente', () => {
    expect(barcodeCandidates('012345678905').sort()).toEqual(
      ['012345678905', '0012345678905', '00012345678905'].sort(),
    );
  });

  it('EAN-13 que é um UPC-A com 0 na frente (o que o iOS entrega): acha o UPC-A de 12 dígitos', () => {
    expect(barcodeCandidates('0012345678905')).toEqual(
      expect.arrayContaining(['012345678905', '0012345678905']),
    );
  });

  it('GTIN-14 com indicador 0: acha o EAN-13 correspondente', () => {
    expect(barcodeCandidates('07899952323991')).toEqual(
      expect.arrayContaining(['7899952323991', '07899952323991']),
    );
  });

  it('EAN-8: mantém o código original', () => {
    expect(barcodeCandidates('96385074')).toContain('96385074');
  });

  it('não gera duplicatas', () => {
    const candidates = barcodeCandidates('0012345678905');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('só zeros não gera candidatos preenchidos sem sentido', () => {
    expect(barcodeCandidates('00000000')).toEqual(['00000000']);
  });
});

describe('findFuzzyProductIds', () => {
  it('busca por similaridade (word_similarity + unaccent) e devolve os ids na ordem do banco', async () => {
    queryRawMock.mockResolvedValue([{ id: 3 }, { id: 1 }]);

    const ids = await findFuzzyProductIds('kaiak');

    expect(ids).toEqual([3, 1]);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it('sem nenhuma correspondência, devolve lista vazia', async () => {
    queryRawMock.mockResolvedValue([]);

    await expect(findFuzzyProductIds('xyz123')).resolves.toEqual([]);
  });

  // Termo curto (3 letras) que é substring literal de um nome bem mais longo: `word_similarity`
  // sozinho pontua mal nesses casos (poucos trigramas, pouca margem estatística) mesmo quando o
  // termo aparece de verdade no nome — ex.: "deo" não achava "DEO PARFUM NATURA HOMEM COR.AGIO".
  // A query precisa ter uma segunda condição (`strpos`) que não dependa de similaridade.
  it('a query do banco também busca por "contém" (strpos), não só por similaridade', async () => {
    queryRawMock.mockResolvedValue([]);

    await findFuzzyProductIds('deo');

    const sql = String(queryRawMock.mock.calls[0][0]);
    expect(sql).toContain('strpos(unaccent(lower(p.name))');
    expect(sql).toContain('word_similarity(unaccent(lower(');
  });

  // Termo comum ("parfum", "deo") casa com milhares de itens do catálogo; se o teto de resultados
  // valesse para o catálogo todo, o produto da loja podia ficar de fora antes do filtro por loja.
  it('com storeId, a query restringe aos produtos da loja ANTES do teto de resultados', async () => {
    queryRawMock.mockResolvedValue([]);

    await findFuzzyProductIds('parfum', 'store-1');

    const call = queryRawMock.mock.calls[0];
    expect(String(call[0])).toContain('store_products');
    expect(call).toContain('store-1');
  });
});

describe('buildProductSearchFilter', () => {
  it('texto comum busca por similaridade no nome (ids que o banco devolveu)', async () => {
    queryRawMock.mockResolvedValue([{ id: 5 }]);

    await expect(buildProductSearchFilter('kaiak')).resolves.toEqual({ id: { in: [5] } });
  });

  it.each([['12'], ['1234567'], ['2 em 1'], ['perfume 100ml'], ['7899952a23991']])(
    'não trata "%s" como código de barras (menos de 8 dígitos ou não é só dígitos)',
    async (term) => {
      queryRawMock.mockResolvedValue([]);

      await expect(buildProductSearchFilter(term)).resolves.toEqual({ id: { in: [] } });
    },
  );

  it('8 a 14 dígitos busca por nome (similaridade) OU por código exato', async () => {
    queryRawMock.mockResolvedValue([{ id: 9 }]);

    const filter = await buildProductSearchFilter('7899952323991');

    expect(filter).toEqual({
      OR: [
        { id: { in: [9] } },
        { barCode: { in: expect.arrayContaining(['7899952323991', '07899952323991']) } },
      ],
    });
  });

  it.each([['12345678'], ['123456789012'], ['12345678901234']])(
    'aceita %s (limites de 8 a 14 dígitos)',
    async (term) => {
      queryRawMock.mockResolvedValue([]);

      await expect(buildProductSearchFilter(term)).resolves.toHaveProperty('OR');
    },
  );

  it('mais de 14 dígitos volta a ser só busca por nome', async () => {
    queryRawMock.mockResolvedValue([]);

    await expect(buildProductSearchFilter('123456789012345')).resolves.toEqual({ id: { in: [] } });
  });

  it('o código é comparado por igualdade (`in`), nunca por "contém"', async () => {
    queryRawMock.mockResolvedValue([]);

    const filter = (await buildProductSearchFilter('7899952323991')) as {
      OR: { barCode?: Record<string, unknown> }[];
    };

    const barcodeClause = filter.OR.find((clause) => clause.barCode);
    expect(Object.keys(barcodeClause?.barCode ?? {})).toEqual(['in']);
  });
});
