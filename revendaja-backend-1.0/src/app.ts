import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod';
import { env } from './config/env';
import { apiDocsEnabled, buildOriginMatcher } from './config/security';
import { UNMATCHED_ROUTE, latencyTracker } from './shared/metrics/latency';
import { pinoOptions } from './shared/logger';
import { TooManyRequestsError } from './shared/errors/AppError';
import { errorHandler } from './shared/errors/errorHandler';
import { healthRoutes } from './modules/health/health.routes';
import { accountRoutes } from './modules/account/account.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { otpRoutes } from './modules/otp/otp.routes';
import { passwordResetRoutes } from './modules/passwordReset/passwordReset.routes';
import { storeRoutes } from './modules/store/store.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { salesRoutes } from './modules/sales/sales.routes';
import { homeRoutes } from './modules/home/home.routes';
import { storefrontRoutes } from './modules/storefront/storefront.routes';
import { uploadsRoutes } from './modules/uploads/uploads.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { billingRoutes } from './modules/billing/billing.routes';
import { aiRoutes } from './modules/ai/ai.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { MAX_IMAGE_BYTES } from './shared/s3';

// Sem anotação explícita de retorno: o tipo real do Fastify aqui carrega o
// ZodTypeProvider (usado pelas rotas), então deixamos o TypeScript inferi-lo
// em vez de forçar o tipo genérico `FastifyInstance` padrão.
const isOriginAllowed = buildOriginMatcher({
  nodeEnv: env.NODE_ENV,
  storeBaseDomain: env.STORE_BASE_DOMAIN,
  webAppUrl: env.WEB_APP_URL,
  extraOrigins: env.CORS_ORIGINS,
});

export async function buildApp() {
  const app = Fastify({
    logger: pinoOptions,
    trustProxy: env.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  // Mede o tempo de resposta de cada rota (ver shared/metrics/latency.ts e a página Desempenho do
  // painel). Usa o MODELO da rota ("/sales/:id"), não a URL real, para não criar uma entrada por id.
  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions.url;
    // Fora da conta: pré-voo do CORS e as rotas do próprio painel (que ele consulta de tempos em tempos).
    if (request.method !== 'OPTIONS' && !route?.startsWith('/admin')) {
      latencyTracker.record(
        request.method,
        route ?? UNMATCHED_ROUTE,
        reply.elapsedTime,
        reply.statusCode,
      );
    }
    done();
  });

  await app.register(helmet);
  // O padrão do @fastify/cors só libera GET/HEAD/POST: sem listar PUT/PATCH/DELETE
  // o preflight de um navegador falha nas rotas de edição/remoção. Origem `*`
  // é aceitável porque a API autentica por header Bearer (não por cookie).
  await app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Só os sites da Revendaja (painel, domínio e vitrines) leem as respostas pelo navegador; ver
    // config/security.ts. O app do celular não depende disto.
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
  });
  await app.register(sensible);
  // Upload da imagem de um produto manual (multipart/form-data). O limite bate com
  // `MAX_IMAGE_BYTES`, que o controller usa pra devolver uma mensagem de erro amigável.
  await app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES } });
  // Limite de requisições POR IP. `global: false`: só vale nas rotas que declaram
  // `config.rateLimit` (as públicas da vitrine); o resto da API não é limitado. Os contadores ficam
  // na memória de cada instância. O erro sai no mesmo formato do resto da API ({ error, message })
  // e o plugin já manda o cabeçalho `Retry-After`.
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new TooManyRequestsError(
        `Muitas requisições. Tente novamente em ${Math.ceil(context.ttl / 1000)} segundos.`,
      ),
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Revendaja API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  // O Swagger UI (interface HTML em /docs, com a lista de todas as rotas) fica de fora do ambiente de
  // testes (alguns pacotes dele são ESM-only e conflitam com o CommonJS do Jest) e, em produção,
  // desligado: só liga com API_DOCS_ENABLED=true (ver config/security.ts).
  if (apiDocsEnabled(env.NODE_ENV, env.API_DOCS_ENABLED)) {
    await app.register(swaggerUI, { routePrefix: '/docs' });
  }

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(otpRoutes);
  await app.register(passwordResetRoutes);
  await app.register(storeRoutes);
  await app.register(catalogRoutes);
  await app.register(salesRoutes);
  await app.register(homeRoutes);
  await app.register(storefrontRoutes);
  await app.register(uploadsRoutes);
  await app.register(notificationRoutes);
  await app.register(billingRoutes);
  await app.register(aiRoutes);
  await app.register(adminRoutes);

  return app;
}
