import type { FunctionTool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import type { AiTool } from '../ai.types';
import { READ_TOOLS } from './read.tools';
import { SALES_TOOLS } from './sales.tools';
import { STORE_TOOLS } from './store.tools';
import { WRITE_TOOLS } from './write.tools';

// Registro das ferramentas do assistente. Para ensinar algo novo à IA (clientes, boletos, registrar
// venda...), crie a ferramenta em `read.tools.ts` ou `write.tools.ts` e ela entra aqui — o loop do
// AiService, a confirmação e a auditoria não mudam.
export const AI_TOOLS: AiTool[] = [...READ_TOOLS, ...SALES_TOOLS, ...STORE_TOOLS, ...WRITE_TOOLS];

const TOOLS_BY_NAME = new Map(AI_TOOLS.map((tool) => [tool.name, tool]));

export function getTool(name: string): AiTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

// Definições no formato da Responses API da OpenAI. Montadas uma vez: a lista (e a ordem) tem que
// ser estável entre requisições para o prefixo do prompt continuar em cache. `strict: false`
// porque os schemas têm campos opcionais e valores padrão (o modo estrito exige todos obrigatórios);
// a validação de verdade é feita pelo zod em AiService#runTool.
export const TOOL_DEFINITIONS: FunctionTool[] = AI_TOOLS.map((tool) => {
  const schema: Record<string, unknown> = z.toJSONSchema(tool.input, { io: 'input' });
  delete schema.$schema;
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: { ...schema, type: 'object' },
    strict: false,
  };
});
