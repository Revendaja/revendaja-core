import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireVerified } from '../../shared/middlewares/requireVerified';
import { uploadImageResponseSchema } from './uploads.schema';
import { uploadProductImage, uploadStoreBanner } from './uploads.controller';

export async function uploadsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/uploads/product-image',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de enviar imagens.')],
      schema: {
        tags: ['uploads'],
        summary:
          'Envia a imagem de um produto manual (multipart/form-data, campo "image") pro S3 e devolve a URL pública.',
        security: [{ bearerAuth: [] }],
        response: { 200: uploadImageResponseSchema },
      },
    },
    uploadProductImage,
  );

  server.post(
    '/uploads/store-banner',
    {
      preHandler: [authenticate, requireVerified('Confirme seu e-mail antes de enviar imagens.')],
      schema: {
        tags: ['uploads'],
        summary:
          'Envia a imagem de um banner da vitrine (multipart/form-data, campo "image") pro S3 e devolve a URL pública.',
        security: [{ bearerAuth: [] }],
        response: { 200: uploadImageResponseSchema },
      },
    },
    uploadStoreBanner,
  );
}
