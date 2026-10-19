process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.PORT = '0';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://revendaja:revendaja@localhost:5432/revendaja_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-key-used-only-in-jest';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-key-used-only-in-jest';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';
process.env.STORE_BASE_DOMAIN = process.env.STORE_BASE_DOMAIN ?? 'revendaja.com';
process.env.OTP_EXPIRATION_MINUTES = process.env.OTP_EXPIRATION_MINUTES ?? '10';
process.env.OTP_MAX_ATTEMPTS = process.env.OTP_MAX_ATTEMPTS ?? '5';
process.env.OTP_RESEND_COOLDOWN_SECONDS = process.env.OTP_RESEND_COOLDOWN_SECONDS ?? '30';
process.env.OTP_RESEND_MAX_PER_HOUR = process.env.OTP_RESEND_MAX_PER_HOUR ?? '5';
process.env.PASSWORD_RESET_EXPIRATION_MINUTES = '15';
process.env.PASSWORD_RESET_MAX_ATTEMPTS = '5';
process.env.PASSWORD_RESET_COOLDOWN_SECONDS = '30';
process.env.PASSWORD_RESET_MAX_PER_HOUR = '5';
// Sempre vazio nos testes (sem `??`): o dotenv não sobrescreve variável já
// definida, então uma RESEND_API_KEY real do .env local nunca dispara e-mails.
process.env.RESEND_API_KEY = '';

// S3 (upload de imagem de produto manual): valores fake, o client do S3 é mockado nos testes que
// tocam a rota de upload — nenhum teste fala com a AWS de verdade.
process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test-access-key-id';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test-secret-access-key';
process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME ?? 'revendaja-test-bucket';
process.env.S3_PUBLIC_BASE_URL =
  process.env.S3_PUBLIC_BASE_URL ?? 'https://revendaja-test-bucket.s3.us-east-1.amazonaws.com';

// Fila de notificações (BullMQ/Redis): valor fake, nunca discado de verdade — `bullmq` é
// mockado globalmente (ver __mocks__/bullmq.ts), então nenhum teste abre conexão real.
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Stripe: valores fake e fixos (sem `??`: uma chave real do .env local nunca pode ser usada nos testes).
// O client da Stripe é injetado/mockado: nenhum teste fala com a Stripe de verdade.
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.STRIPE_PRICE_STARTER = 'price_starter';
process.env.STRIPE_PRICE_PREMIUM = 'price_premium';
process.env.STRIPE_PRICE_BUSINESS = 'price_business';
process.env.WEB_APP_URL = 'http://localhost:3001';
