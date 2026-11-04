import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireAdmin } from '../../shared/middlewares/requireAdmin';
import { adminAiQuerySchema, adminStoresQuerySchema } from './admin.schema';
import type { AdminAiQuery, AdminStoresQuery } from './admin.schema';
import { adminService } from './admin.service';

// Painel da administradora. Todas as rotas exigem login e o papel `admin` (conferido no banco a cada
// chamada). Sem schema de resposta de propósito: são relatórios que mudam com frequência e quem lê é
// o painel web, que tem os próprios tipos.
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [authenticate, requireAdmin];
  const base = { tags: ['admin'], security: [{ bearerAuth: [] }] };

  // O painel web chama esta para saber se mostra a área de administração (403 = não é admin).
  server.get(
    '/admin/session',
    { preHandler, schema: { ...base, summary: 'Confirma que a conta é de administradora.' } },
    async (_request: FastifyRequest, reply: FastifyReply) => reply.send({ admin: true }),
  );

  server.get(
    '/admin/overview',
    {
      preHandler,
      schema: {
        ...base,
        summary:
          'Visão geral da empresa: clientes, lojas por plano, assinaturas, faturamento das lojas, crescimento e IA.',
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.send(await adminService.overview()),
  );

  server.get(
    '/admin/stores',
    {
      preHandler,
      schema: {
        ...base,
        summary: 'Lojas com plano, assinatura, contato, atividade e consumo de IA.',
        querystring: adminStoresQuerySchema,
      },
    },
    async (request: FastifyRequest<{ Querystring: AdminStoresQuery }>, reply: FastifyReply) =>
      reply.send(await adminService.stores(request.query)),
  );

  server.get(
    '/admin/ai',
    {
      preHandler,
      schema: {
        ...base,
        summary: 'Consumo do assistente de IA: total do mês, histórico e ranking por loja.',
        querystring: adminAiQuerySchema,
      },
    },
    async (request: FastifyRequest<{ Querystring: AdminAiQuery }>, reply: FastifyReply) =>
      reply.send(await adminService.ai(request.query)),
  );

  server.get(
    '/admin/plans',
    {
      preHandler,
      schema: { ...base, summary: 'Limites e recursos de cada plano, como estão no código.' },
    },
    async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.send({ plans: adminService.plans() }),
  );

  server.get(
    '/admin/latency',
    {
      preHandler,
      schema: {
        ...base,
        summary:
          'Tempo de resposta de cada rota (p50, p95, p99), erros e volume na última hora, mais a latência do banco. Medido em memória nesta máquina.',
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.send(await adminService.latency()),
  );

  server.get(
    '/admin/system',
    {
      preHandler,
      schema: {
        ...base,
        summary: 'Saúde do sistema: integrações configuradas, banco, fila, migrations e execução.',
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.send(await adminService.system()),
  );
}
