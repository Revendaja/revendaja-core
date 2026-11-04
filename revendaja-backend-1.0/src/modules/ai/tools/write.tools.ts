import { z } from 'zod';
import { AppError, ConflictError, NotFoundError } from '../../../shared/errors/AppError';
import { catalogService } from '../../catalog/catalog.service';
import { storeService } from '../../store/store.service';
import { aiQueries } from '../ai.queries';
import { defineWriteTool } from '../ai.types';
import { formatBRL } from './tools.shared';

// Ferramentas de ESCRITA. O modelo só propõe: `prepare` valida e descreve a operação, e o `apply`
// só roda depois que a usuária confirma. Quem grava são os services que o app já usa, com todas as
// regras de sempre (limite do plano, estoque nunca negativo, produto duplicado...).

const MAX_STOCK = 1_000_000;
const MAX_MONEY = 99_999_999.99;

export const addToStockTool = defineWriteTool({
  name: 'propose_add_to_stock',
  description:
    'Propõe cadastrar um produto do catálogo no estoque da loja. NÃO executa: a usuária precisa confirmar no app. Use o productId vindo de search_catalog, depois que a usuária escolheu o produto e informou a quantidade. Sem preço, usa o preço sugerido do catálogo.',
  input: z.object({
    productId: z
      .number()
      .int()
      .positive()
      .describe('Id do produto no catálogo (de search_catalog).'),
    quantity: z.number().int().min(1).max(MAX_STOCK).describe('Unidades que entram no estoque.'),
    price: z.number().min(0).max(MAX_MONEY).optional().describe('Preço de venda. Opcional.'),
    costPrice: z.number().min(0).max(MAX_MONEY).optional().describe('Preço de custo. Opcional.'),
  }),
  async prepare(ctx, input) {
    const product = await catalogService.getProduct(input.productId);

    const existing = await aiQueries.storeProductIdsByCatalogId(ctx.storeId, [input.productId]);
    const storeProductId = existing.get(input.productId);
    if (storeProductId) {
      throw new ConflictError(
        `"${product.name}" já está no estoque da loja (storeProductId ${storeProductId}). Para mudar a quantidade, use propose_adjust_stock.`,
      );
    }

    const price = input.price ?? product.basePrice;
    const priceNote = input.price === undefined ? ' (preço sugerido do catálogo)' : '';
    return {
      summary: `Adicionar "${product.name}" (${product.brand.name}) ao estoque: ${input.quantity} unidade(s), preço de venda ${formatBRL(price)}${priceNote}.`,
      preview: {
        productId: input.productId,
        name: product.name,
        brand: product.brand.name,
        image: product.productImageSm ?? product.productImage,
        quantity: input.quantity,
        price,
        costPrice: input.costPrice ?? null,
      },
      payload: {
        productId: input.productId,
        quantity: input.quantity,
        price,
        costPrice: input.costPrice,
      },
    };
  },
  async apply(ctx, payload) {
    const created = await storeService.addProduct(ctx.userId, {
      productId: payload.productId,
      price: payload.price ?? 0,
      costPrice: payload.costPrice ?? null,
      stock: payload.quantity,
    });
    return { storeProductId: created.id, stock: created.stock, price: created.price };
  },
});

const adjustStockInput = z.object({
  storeProductId: z.string().uuid().describe('Id do produto na loja.'),
  mode: z
    .enum(['add', 'remove', 'set'])
    .describe('add = soma a quantidade; remove = subtrai; set = define o estoque total.'),
  quantity: z.number().int().min(0).max(MAX_STOCK),
});

export const adjustStockTool = defineWriteTool({
  name: 'propose_adjust_stock',
  description:
    'Propõe mudar a quantidade em estoque de um produto que JÁ está na loja: add (entrada), remove (saída) ou set (definir o total). NÃO executa: a usuária precisa confirmar no app. Use o storeProductId de search_my_stock ou search_catalog.',
  input: adjustStockInput,
  payloadSchema: adjustStockInput.extend({ expectedCurrentStock: z.number().int() }),
  async prepare(ctx, input) {
    const row = await aiQueries.findStockRow(ctx.storeId, input.storeProductId);
    if (!row) {
      throw new NotFoundError('Produto não encontrado na sua loja.');
    }

    if (input.mode !== 'set' && input.quantity === 0) {
      throw new AppError('Informe uma quantidade maior que zero.', 400, 'INVALID_QUANTITY');
    }
    if (input.mode === 'remove' && input.quantity > row.stock) {
      throw new AppError(
        `O estoque atual de "${row.name}" é ${row.stock}: não dá para remover ${input.quantity}.`,
        400,
        'INSUFFICIENT_STOCK',
      );
    }

    const newStock =
      input.mode === 'add'
        ? row.stock + input.quantity
        : input.mode === 'remove'
          ? row.stock - input.quantity
          : input.quantity;
    if (newStock > MAX_STOCK) {
      throw new AppError(
        `O estoque não pode passar de ${MAX_STOCK} unidades.`,
        400,
        'STOCK_TOO_LARGE',
      );
    }
    if (newStock === row.stock) {
      throw new AppError(
        `O estoque de "${row.name}" já é ${row.stock}: nada a mudar.`,
        400,
        'NO_CHANGE',
      );
    }

    return {
      summary: `Estoque de "${row.name}" (${row.brand}): de ${row.stock} para ${newStock} unidade(s).`,
      preview: {
        storeProductId: row.storeProductId,
        name: row.name,
        brand: row.brand,
        image: row.image,
        currentStock: row.stock,
        newStock,
      },
      // `expectedCurrentStock` protege a confirmação: se o estoque mudou nesse meio tempo (uma venda,
      // por exemplo), a operação é recusada em vez de gravar um número desatualizado.
      payload: {
        storeProductId: input.storeProductId,
        mode: input.mode,
        quantity: input.quantity,
        expectedCurrentStock: row.stock,
      },
    };
  },
  async apply(ctx, payload) {
    const row = await aiQueries.findStockRow(ctx.storeId, payload.storeProductId);
    if (!row) {
      throw new NotFoundError('Produto não encontrado na sua loja.');
    }
    if (row.stock !== payload.expectedCurrentStock) {
      throw new ConflictError(
        `O estoque de "${row.name}" mudou desde o pedido (agora é ${row.stock}). Peça de novo para eu conferir.`,
      );
    }

    const newStock =
      payload.mode === 'add'
        ? row.stock + payload.quantity
        : payload.mode === 'remove'
          ? row.stock - payload.quantity
          : payload.quantity;
    if (newStock < 0) {
      throw new AppError('O estoque não pode ficar negativo.', 400, 'INSUFFICIENT_STOCK');
    }

    const updated = await storeService.updateProduct(ctx.userId, payload.storeProductId, {
      stock: newStock,
    });
    return { storeProductId: updated.id, previousStock: row.stock, stock: updated.stock };
  },
});

export const WRITE_TOOLS = [addToStockTool, adjustStockTool];
