import { Prisma } from '@prisma/client';
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
// Sinônimos do vocabulário de perfumaria: quem digita "perfume" aceita "Eau de Toilette"/"Colônia",
// "masculino" aceita "Homem"/"For Men" etc. Só termos seguros (sem "man"/"men", que casariam com
// "romantic"/"mandarina"). Não incluem "perfumado", pra "perfume" não trazer hidratante perfumado.
const SYNONYMS: Record<string, string[]> = {
  perfume: ['parfum', 'colonia', 'eau de toilette', 'eau de cologne'],
  perfumes: ['parfum', 'colonia', 'eau de toilette', 'eau de cologne'],
  colonia: ['eau de toilette', 'eau de cologne'],
  masculino: ['homem', 'pour homme', 'for men', 'for him'],
  masculina: ['homem', 'pour homme', 'for men', 'for him'],
  feminino: ['mulher', 'femme', 'for women', 'for her'],
  feminina: ['mulher', 'femme', 'for women', 'for her'],
};

// Palavras comuns de perfumaria, só pra corrigir erro de digitação ("prefume", "madsculino"): a
// similaridade por trigramas não separa "prefume~perfume" de "prefume~presente" (mesma nota), mas a
// distância de edição separa. Palavras fora da lista (marcas, nomes de produto) seguem pela similaridade.
const VOCABULARY = [
  'perfume',
  'perfumes',
  'masculino',
  'masculina',
  'masculinos',
  'feminino',
  'feminina',
  'femininos',
  'colonia',
  'hidratante',
  'desodorante',
  'antitranspirante',
  'sabonete',
  'shampoo',
  'condicionador',
  'creme',
  'presente',
  'batom',
  'esmalte',
  'protetor',
  'maquiagem',
  'infantil',
  'unissex',
  'corporal',
  'facial',
  'barba',
  'locao',
  'mascara',
  'oleo',
  'spray',
  'cabelo',
  'kit',
];

function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Distância de edição com troca de letras vizinhas ("prefume" -> "perfume" = 1).
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Troca uma palavra com erro de digitação pela do vocabulário mais próxima (só se for clara);
// palavra certa, prefixo de uma ("perfum") ou desconhecida fica como está.
export function correctToken(token: string): string {
  const word = plain(token);
  if (word.length < 5 || VOCABULARY.includes(word) || VOCABULARY.some((v) => v.startsWith(word)))
    return token;
  const maxDistance = word.length >= 7 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  let tie = false;
  for (const candidate of VOCABULARY) {
    const distance = editDistance(word, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tie = false;
    } else if (distance === bestDistance && best !== candidate) {
      tie = true;
    }
  }
  return best && !tie ? best : token;
}

// "perfume masculino" vira ['perfume', 'masculino']: CADA palavra precisa combinar (E), senão
// "perfume masculino" traria hidratante só porque diz "masculino".
function searchTokens(search: string): string[] {
  const tokens = search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => correctToken(t.toLowerCase()));
  return [...new Set(tokens)].slice(0, 6);
}

function normalizeSynonymKey(token: string): string {
  return token.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Condição SQL (sobre `column`) de "todas as palavras combinam": literal (contém, ou um sinônimo) ou,
// se `fuzzy`, parecido por similaridade (tolera erro de digitação: "prefume madsculino").
function allTokensMatch(column: Prisma.Sql, tokens: string[], fuzzy: boolean): Prisma.Sql {
  const perToken = tokens.map((token) => {
    const terms = [token, ...(SYNONYMS[normalizeSynonymKey(token)] ?? [])];
    const parts = terms.map(
      (t) => Prisma.sql`strpos(unaccent(lower(${column})), unaccent(lower(${t}))) > 0`,
    );
    if (fuzzy) {
      parts.push(
        Prisma.sql`word_similarity(unaccent(lower(${token})), unaccent(lower(${column}))) > ${FUZZY_THRESHOLD}`,
      );
    }
    return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
  });
  return Prisma.join(perToken, ' AND ');
}

// Se algum nome combina LITERALMENTE com todas as palavras, mostra só esses: os "parecidos"
// ("Malbec" ~ "Malva") só entram quando nada combina literalmente (aí servem de "quis dizer").
function preferLiteral<T extends { literal?: boolean }>(rows: T[]): T[] {
  const literal = rows.filter((row) => row.literal);
  return literal.length > 0 ? literal : rows;
}

// Produtos do catálogo cujo nome COMBINA com `search` (todas as palavras; ver acima). Busca por
// "contém" sozinha não tolera erro de digitação, e a fuzzy sozinha pontua mal termos curtos (ex.:
// "deo"): por isso as duas, em OR por palavra. `strpos` (não LIKE): "%"/"_" digitado é texto normal.
// Com `storeId`, só considera produtos que a loja tem: o teto de FUZZY_LIMIT vale para o resultado
// DA LOJA, não do catálogo inteiro.
export async function findFuzzyProductIds(search: string, storeId?: string): Promise<number[]> {
  const tokens = searchTokens(search);
  if (tokens.length === 0) return [];
  const column = Prisma.sql`p.name`;
  const rows = await prisma.$queryRaw<{ id: number; literal?: boolean }[]>`
    SELECT p.id, (${allTokensMatch(column, tokens, false)}) AS literal FROM products p
    WHERE (${allTokensMatch(column, tokens, true)})
      AND (${storeId ?? null}::text IS NULL OR EXISTS (
        SELECT 1 FROM store_products sp WHERE sp.product_id = p.id AND sp.store_id = ${storeId ?? null}::text
      ))
    ORDER BY word_similarity(unaccent(lower(${search})), unaccent(lower(p.name))) DESC
    LIMIT ${FUZZY_LIMIT}
  `;
  return preferLiteral(rows).map((row) => row.id);
}

// Mesma busca, mas no nome de um produto MANUAL (kit/cesta). Escopado por loja.
export async function findFuzzyStoreProductIds(storeId: string, search: string): Promise<string[]> {
  const tokens = searchTokens(search);
  if (tokens.length === 0) return [];
  const column = Prisma.sql`name`;
  const rows = await prisma.$queryRaw<{ id: string; literal?: boolean }[]>`
    SELECT id, (${allTokensMatch(column, tokens, false)}) AS literal FROM store_products
    WHERE store_id = ${storeId}
      AND name IS NOT NULL
      AND (${allTokensMatch(column, tokens, true)})
    ORDER BY word_similarity(unaccent(lower(${search})), unaccent(lower(name))) DESC
    LIMIT ${FUZZY_LIMIT}
  `;
  return preferLiteral(rows).map((row) => row.id);
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
