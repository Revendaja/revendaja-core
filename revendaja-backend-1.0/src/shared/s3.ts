import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { AppError } from './errors/AppError';

// Formatos aceitos pra imagem de produto manual, e o limite de tamanho (o mesmo valor é usado pra
// configurar o plugin de multipart em `app.ts`).
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME_TYPE: Record<(typeof ALLOWED_IMAGE_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Confere os bytes de verdade do arquivo (não só o `Content-Type` que o cliente declarou, que é
// fácil de forjar): cada formato tem uma assinatura fixa nos primeiros bytes. Devolve null se não
// bater com nenhum formato aceito — nesse caso o upload é recusado, mesmo que o header dissesse "image/jpeg".
export function detectImageMimeType(buffer: Buffer): (typeof ALLOWED_IMAGE_MIME_TYPES)[number] | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export interface ImageUploadProvider {
  upload(params: { buffer: Buffer; contentType: string; folder: string }): Promise<{ url: string }>;
}

function createS3ImageUploadProvider(): ImageUploadProvider {
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  return {
    async upload({ buffer, contentType, folder }) {
      const extension = EXTENSION_BY_MIME_TYPE[contentType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]] ?? 'jpg';
      const key = `${folder}/${randomUUID()}.${extension}`;

      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );

      return { url: `${env.S3_PUBLIC_BASE_URL}/${key}` };
    },
  };
}

// Sem as variáveis do S3 configuradas (dev/test que ainda não recebeu as credenciais): a rota de
// upload responde 500 com uma mensagem clara em vez de deixar a API inteira sem subir — mesmo
// padrão do `mailProvider` (que loga no console em vez de mandar e-mail sem RESEND_API_KEY).
const unconfiguredImageUploadProvider: ImageUploadProvider = {
  async upload() {
    throw new AppError(
      'Upload de imagem não configurado. Defina AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME e S3_PUBLIC_BASE_URL.',
      500,
      'IMAGE_UPLOAD_NOT_CONFIGURED',
    );
  },
};

const isS3Configured = Boolean(
  env.AWS_REGION && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.S3_BUCKET_NAME && env.S3_PUBLIC_BASE_URL,
);

export const imageUploadProvider: ImageUploadProvider = isS3Configured
  ? createS3ImageUploadProvider()
  : unconfiguredImageUploadProvider;
