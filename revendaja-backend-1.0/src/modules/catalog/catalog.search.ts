import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

// Do EAN-8 ao GTIN-14: só dígitos, de 8 a 14. Termos mais curtos (ex.: "12")
// continuam sendo só busca por nome — casar "12" com códigos de barras traria
// ruído, e ninguém digita/escaneia um código com menos de 8 dígitos.
const BARCODE_PATTERN = /^\d{8,14}$/;

// Abaixo do padrão do Postgres (0.6): tolera erro de digitação (ex.: "Prefume" ~ "Perfume", troca de
// letra) e acento diferente, sem virar "acha qualquer coisa parecida" (testado contra o banco).
const FUZZY_THRESHOLD = 0.3;
// Teto de segurança na busca por similaridade — o resultado final ainda passa pela paginação normal.
const FUZZY_LIMIT = 300;

// O mesmo item pode aparecer com o código em tamanhos diferentes: um UPC-A tem
// 12 dígitos, o EAN-13 do mesmo produto é o UPC com um "0" na frente, e o
// GTIN-14 é o EAN-13 com outro "0". Alguns leitores (o iOS, por exemplo)
// entregam o UPC-A já como EAN-13. Por isso comparamos ignorando zeros à
// esquerda: o termo original mais o mesmo número preenchido até 12, 13 e 14.
export function barcodeCandidates(digits: string): string[] {
  const candidates = new Set([digits]);
  const core = digits.replace(/^0+/, '');

  if (core.length > 0) {
    for (const size of [12, 13, 14]) {
      candidates.add(core.padStart(size, '0'));
    }
  }

  return [...candidates];
}

// Produtos do catálogo cujo nome COMBINA com `search`: ou contém o termo literalmente em qualquer
// posição (`strpos`, não "LIKE" — assim um "%"/"_" digitado é texto normal, não curinga), ou é
// PARECIDO por similaridade (`word_similarity`, tolerando letra trocada/faltando e acento diferente).
// A busca por "contém" sozinha não bastaria (não tolera erro de digitação) nem a fuzzy sozinha
// bastaria: `word_similarity` pontua mal termos curtos (ex.: "deo") mesmo quando aparecem literalmente
// no nome, porque poucos trigramas dão pouca margem estatística — por isso as duas, em OR.
// `unaccent(lower(...))` dos dois lados nas duas comparações.
// Com `storeId`, só considera produtos que a loja tem: o teto de FUZZY_LIMIT vale para o resultado
// DA LOJA, não do catálogo inteiro (senão um termo comum como "parfum" ou "deo", que casa com
// milhares de itens, cortava fora o produto da loja antes de o filtro por loja ser aplicado).
export async function findFuzzyProductIds(search: string, storeId?: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT p.id FROM products p
    WHERE (
        strpos(unaccent(lower(p.name)), unaccent(lower(${search}))) > 0
        OR word_similarity(unaccent(lower(${search})), unaccent(lower(p.name))) > ${FUZZY_THRESHOLD}
      )
      AND (${storeId ?? null}::text IS NULL OR EXISTS (
        SELECT 1 FROM store_products sp WHERE sp.product_id = p.id AND sp.store_id = ${storeId ?? null}::text
      ))
    ORDER BY word_similarity(unaccent(lower(${search})), unaccent(lower(p.name))) DESC
    LIMIT ${FUZZY_LIMIT}
  `;
  return rows.map((row) => row.id);
}

// Mesma busca, mas no nome de um produto MANUAL (kit/cesta — não tem `Product` de catálogo, o nome
// próprio fica em `StoreProduct.name`). Escopado por loja.
export async function findFuzzyStoreProductIds(storeId: string, search: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM store_products
    WHERE store_id = ${storeId}
      AND name IS NOT NULL
      AND (
        strpos(unaccent(lower(name)), unaccent(lower(${search}))) > 0
        OR word_similarity(unaccent(lower(${search})), unaccent(lower(name))) > ${FUZZY_THRESHOLD}
      )
    ORDER BY word_similarity(unaccent(lower(${search})), unaccent(lower(name))) DESC
    LIMIT ${FUZZY_LIMIT}
  `;
  return rows.map((row) => row.id);
}

// `search` sempre procura no nome (por similaridade, não só "contém" — ver findFuzzyProductIds). Se
// o termo parece um código de barras, procura também por código EXATO — exato porque um
// prefixo/trecho de código de barras não identifica ninguém.
export async function buildProductSearchFilter(
  search: string,
  storeId?: string,
): Promise<Prisma.ProductWhereInput> {
  const byName: Prisma.ProductWhereInput = {
    id: { in: await findFuzzyProductIds(search, storeId) },
  };

  if (!BARCODE_PATTERN.test(search)) {
    return byName;
  }

  return { OR: [byName, { barCode: { in: barcodeCandidates(search) } }] };
}
