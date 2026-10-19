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
import { pinoOptions } from './shared/logger';
import { TooManyRequestsError } from './shared/errors/AppError';
import { errorHandler } from './shared/errors/errorHandler';
import { healthRoutes } from './modules/health/health.routes';
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
import { MAX_IMAGE_BYTES } from './shared/s3';

// Sem anotação explícita de retorno: o tipo real do Fastify aqui carrega o
// ZodTypeProvider (usado pelas rotas), então deixamos o TypeScript inferi-lo
// em vez de forçar o tipo genérico `FastifyInstance` padrão.
export async function buildApp() {
  const app = Fastify({
    logger: pinoOptions,
    trustProxy: env.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  // O padrão do @fastify/cors só libera GET/HEAD/POST: sem listar PUT/PATCH/DELETE
  // o preflight de um navegador falha nas rotas de edição/remoção. Origem `*`
  // é aceitável porque a API autentica por header Bearer (não por cookie).
  await app.register(cors, { methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });
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
  // O Swagger UI (interface HTML em /docs) só é registrado fora do ambiente
  // de testes: alguns pacotes que ele carrega internamente são ESM-only e
  // conflitam com o CommonJS usado pelo Jest — e nenhum teste precisa da UI,
  // só das rotas da API.
  if (env.NODE_ENV !== 'test') {
    await app.register(swaggerUI, { routePrefix: '/docs' });
  }

  await app.register(healthRoutes);
  await app.register(authRoutes);
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

  return app;
}
