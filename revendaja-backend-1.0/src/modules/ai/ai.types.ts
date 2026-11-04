import type { z } from 'zod';

// Contexto de uma chamada de ferramenta. Tudo aqui vem do token da usuária (nunca do modelo):
// é o que garante que uma ferramenta só enxerga e altera a loja de quem está conversando.
export interface AiToolContext {
  userId: string;
  storeId: string;
  conversationId: string;
}

// Cartões que o app desenha nativamente (foto, nome, marca...) — o modelo só recebe um resumo.
export type UiCard =
  | {
      type: 'catalog_product';
      productId: number;
      name: string;
      brand: string;
      image: string | null;
      price: number;
      // Quando já está na loja, o id do produto da loja (para ajustar o estoque em vez de cadastrar).
      storeProductId: string | null;
    }
  | {
      type: 'stock_product';
      storeProductId: string;
      name: string;
      brand: string;
      image: string | null;
      stock: number;
      minStock: number;
      price: number;
      costPrice: number | null;
    };

export interface ReadToolResult {
  // JSON entregue ao modelo (já com os números calculados pelo backend).
  data: unknown;
  cards?: UiCard[];
}

export interface PreparedAction {
  // Texto curto, em português, mostrado à usuária no pedido de confirmação.
  summary: string;
  // Dados estruturados para o app montar a tela de confirmação.
  preview: Record<string, unknown>;
  // Entrada normalizada (preço padrão aplicado, nome resolvido...) que será executada ao confirmar.
  payload: unknown;
}

interface ToolBase {
  name: string;
  description: string;
  // Schema da entrada: vira o JSON Schema da ferramenta e valida o que o modelo mandar.
  input: z.ZodType<unknown>;
}

// Leitura: executa na hora e devolve dados.
export interface ReadTool extends ToolBase {
  kind: 'read';
  run(ctx: AiToolContext, input: unknown): Promise<ReadToolResult>;
}

// Escrita: o modelo só PROPÕE. `prepare` valida contra as regras do backend e descreve a operação;
// `apply` só roda depois que a usuária confirma (ver AiService#confirmAction).
export interface WriteTool extends ToolBase {
  kind: 'write';
  prepare(ctx: AiToolContext, input: unknown): Promise<PreparedAction>;
  apply(ctx: AiToolContext, payload: unknown): Promise<unknown>;
}

export type AiTool = ReadTool | WriteTool;

export function defineReadTool<S extends z.ZodType>(def: {
  name: string;
  description: string;
  input: S;
  run(ctx: AiToolContext, input: z.infer<S>): Promise<ReadToolResult>;
}): ReadTool {
  return {
    kind: 'read',
    name: def.name,
    description: def.description,
    input: def.input,
    run: (ctx, input) => def.run(ctx, input as z.infer<S>),
  };
}

export function defineWriteTool<S extends z.ZodType, P extends z.ZodType = S>(def: {
  name: string;
  description: string;
  input: S;
  // Forma do que `prepare` grava e `apply` executa, quando difere do que o modelo envia (ex.: guarda
  // o estoque visto na proposta). Sem ela, vale o próprio `input`.
  payloadSchema?: P;
  prepare(ctx: AiToolContext, input: z.infer<S>): Promise<PreparedAction>;
  apply(ctx: AiToolContext, payload: z.infer<P>): Promise<unknown>;
}): WriteTool {
  const payloadSchema: z.ZodType = def.payloadSchema ?? def.input;
  return {
    kind: 'write',
    name: def.name,
    description: def.description,
    input: def.input,
    prepare: (ctx, input) => def.prepare(ctx, input as z.infer<S>),
    // Revalida na hora de executar: o payload veio do banco, não de uma chamada recém-validada.
    apply: async (ctx, payload) => def.apply(ctx, payloadSchema.parse(payload) as z.infer<P>),
  };
}

export type AiActionStatus =
  'pending' | 'executing' | 'executed' | 'failed' | 'cancelled' | 'expired';

export interface AiActionView {
  id: string;
  tool: string;
  summary: string;
  preview: Record<string, unknown> | null;
  status: AiActionStatus;
  result: unknown;
  error: string | null;
  expiresAt: Date;
}

export interface ChatResult {
  conversationId: string;
  message: string;
  cards: UiCard[];
  pendingActions: AiActionView[];
}

// Itens do histórico, no formato de entrada da Responses API da OpenAI.
export type AiItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };
