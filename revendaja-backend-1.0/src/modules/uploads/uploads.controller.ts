import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../shared/errors/AppError';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  detectImageMimeType,
  imageUploadProvider,
} from '../../shared/s3';

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

function isAllowedImageMimeType(value: string): value is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

// Usada pela imagem de um produto manual (ex.: o ursinho, a cesta). O app manda a imagem por aqui
// em vez de falar com a AWS diretamente: as credenciais do S3 ficam só no servidor.
async function handleImageUpload(request: FastifyRequest, reply: FastifyReply, folder: string) {
  if (!request.isMultipart()) {
    throw new AppError('Envie a imagem como multipart/form-data.', 400, 'INVALID_UPLOAD');
  }

  const file = await request.file();
  if (!file) {
    throw new AppError('Nenhuma imagem enviada.', 400, 'MISSING_IMAGE');
  }
  if (!isAllowedImageMimeType(file.mimetype)) {
    throw new AppError(
      'Formato de imagem não suportado. Envie JPEG, PNG ou WEBP.',
      400,
      'UNSUPPORTED_IMAGE_TYPE',
    );
  }

  const buffer = await file.toBuffer();
  // O limite do plugin (`limits.fileSize`, configurado em `app.ts`) já corta o stream nesse
  // tamanho; `truncated` confirma que o arquivo estourou o limite (não terminou de propósito).
  if (file.file.truncated) {
    throw new AppError(
      `Imagem muito grande (máx. ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB).`,
      400,
      'IMAGE_TOO_LARGE',
    );
  }

  // O `mimetype` acima é só o que o cliente DECLAROU (fácil de forjar); aqui confere os bytes de
  // verdade do arquivo. Usa o tipo detectado (não o declarado) pro upload — é o que garante que o
  // que vai pro S3 é mesmo uma imagem dos formatos aceitos.
  const detectedType = detectImageMimeType(buffer);
  if (!detectedType) {
    throw new AppError(
      'O arquivo enviado não é uma imagem JPEG, PNG ou WEBP válida.',
      400,
      'INVALID_IMAGE_CONTENT',
    );
  }

  const { url } = await imageUploadProvider.upload({
    buffer,
    contentType: detectedType,
    folder: `users/${request.userId}/${folder}`,
  });

  return reply.send({ url });
}

export function uploadProductImage(request: FastifyRequest, reply: FastifyReply) {
  return handleImageUpload(request, reply, 'products');
}

// Banners da vitrine (topo, ofertas e coleções): mesma validação, outra pasta no bucket.
export function uploadStoreBanner(request: FastifyRequest, reply: FastifyReply) {
  return handleImageUpload(request, reply, 'banners');
}
