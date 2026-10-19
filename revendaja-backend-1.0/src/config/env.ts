import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // 0 é um valor válido (o SO escolhe uma porta livre) — usado nos testes.
    PORT: z.coerce.number().int().nonnegative().default(3000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().url(),

    // Redis para a fila de notificações (BullMQ). Se ficar indisponível em runtime, a API
    // continua no ar servindo venda/estoque normalmente — só as notificações degradam até
    // o Redis voltar (ver src/shared/queue/redis.ts). A variável em si é sempre obrigatória:
    // sem ela não há como nem tentar montar a fila.
    REDIS_URL: z.string().url(),

    // Access token: de vida curta, usado em toda requisição autenticada.
    JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter pelo menos 16 caracteres.'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    // Refresh token: de vida longa, assinado com um segredo diferente do
    // access token (assim um refresh token nunca passa na verificação de
    // uma rota comum, mesmo sem checagem extra de "tipo" no payload).
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET deve ter pelo menos 16 caracteres.'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

    // Domínio base para o link da loja: {STORE_LINK_SCHEME}://{handle}.STORE_BASE_DOMAIN
    // Em desenvolvimento use "localhost:3001" (vianastore.localhost:3001); em produção, "revendaja.com".
    STORE_BASE_DOMAIN: z.string().default('revendaja.com'),
    // Esquema do link da loja. Ausente: "http" para localhost e "https" para qualquer outro domínio.
    STORE_LINK_SCHEME: z.enum(['http', 'https']).optional(),

    // Atrás de um proxy/balanceador (nginx, Render, Railway...) o IP real do cliente vem no
    // X-Forwarded-For. Ligue SÓ se houver um proxy confiável na frente: senão qualquer um forja o
    // IP e burla o limite de requisições das rotas públicas. Desligado, vale o IP da conexão —
    // e, atrás de um proxy, todo mundo parece vir do mesmo IP (e divide o mesmo limite).
    TRUST_PROXY: z.stringbool().default(false),

    // Pedido feito na vitrine que ninguém paga é cancelado sozinho depois de tantas horas, e o
    // estoque que ele reservava volta para a loja. A loja ainda pode cancelar antes, à mão.
    ONLINE_ORDER_EXPIRATION_HOURS: z.coerce.number().int().min(1).default(48),

    // Por quantos dias guardar as visitas da vitrine. Só as dos últimos 7 dias alimentam a tela
    // Minha Loja, então 7 é o mínimo; as mais antigas são apagadas todo dia.
    STORE_VISITS_RETENTION_DAYS: z.coerce.number().int().min(7).default(30),

    // Client ID do OAuth do Google (tipo "Web application", mesmo projeto do google-services.json
    // do app mobile). É a audience que valida o ID token recebido em POST /auth/google — ver
    // src/modules/auth/google.ts. O app mobile usa o MESMO client id como `webClientId` do
    // @react-native-google-signin/google-signin (é assim que ele consegue emitir um ID token que
    // este client id consegue validar, mesmo no fluxo nativo Android/iOS).
    // Opcional (como RESEND_API_KEY/AWS): sem ela só a rota /auth/google fica indisponível (erro
    // claro), o resto da API sobe normalmente. Obrigatória em produção (ver `.refine` abaixo).
    GOOGLE_CLIENT_ID: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),

    OTP_EXPIRATION_MINUTES: z.coerce.number().int().positive().default(10),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(30),
    OTP_RESEND_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),

    // Redefinição de senha: um código de 6 dígitos enviado por e-mail (o app
    // não usa link). Como 6 dígitos são fáceis de adivinhar, o código expira
    // rápido e tem poucas tentativas.
    PASSWORD_RESET_EXPIRATION_MINUTES: z.coerce.number().int().positive().default(15),
    PASSWORD_RESET_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    PASSWORD_RESET_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(30),
    PASSWORD_RESET_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),

    // E-mail transacional via Resend. Sem RESEND_API_KEY (dev/test) os e-mails
    // não saem: o conteúdo é apenas logado no console. Em produção a chave é
    // obrigatória (ver `.refine` abaixo). O remetente padrão é o domínio de
    // testes da Resend, que só entrega para o e-mail dono da conta — para
    // enviar de verdade, verifique um domínio próprio e ajuste MAIL_FROM.
    RESEND_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
    MAIL_FROM: z.string().min(1).default('Revendaja <onboarding@resend.dev>'),

    // Upload de imagem de produto manual (S3). O app manda a imagem pra API (multipart), que sobe
    // pro bucket e devolve a URL pública — o app nunca fala com a AWS diretamente. Sem essas
    // variáveis (dev/test), a rota de upload responde 500 com uma mensagem clara em vez de deixar
    // a API inteira sem subir; em produção elas são obrigatórias (ver `.refine` abaixo).
    AWS_REGION: z.string().trim().optional(),
    AWS_ACCESS_KEY_ID: z.string().trim().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().trim().optional(),
    S3_BUCKET_NAME: z.string().trim().optional(),
    // URL pública base pra montar o link da imagem (ex.: domínio do bucket ou de um CDN na frente
    // dele). Sem barra no final: a key do objeto é anexada como "/{key}".
    S3_PUBLIC_BASE_URL: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),

    // Push notifications (Expo). Sem EXPO_ACCESS_TOKEN o envio ainda funciona (só é exigido
    // pelo Expo quando a conta tem "enhanced security" ativada) — por isso é opcional mesmo
    // em produção, diferente de RESEND_API_KEY/AWS.
    EXPO_ACCESS_TOKEN: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),

    // Cobrança (Stripe). Tudo opcional (como RESEND_API_KEY/AWS): sem STRIPE_SECRET_KEY só as rotas
    // de /billing respondem 503 com uma mensagem clara; o resto da API sobe normalmente. Use uma
    // chave restrita (rk_...) com permissão só para Customers, Checkout Sessions, Subscriptions,
    // Invoices, Payment Methods e Customer Portal — nunca a chave secreta completa.
    STRIPE_SECRET_KEY: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
    // Segredo de assinatura do endpoint de webhook (whsec_...). Sem ele o webhook rejeita tudo.
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
    // Id do preço (price_...) recorrente mensal de cada plano pago, criado no Dashboard da Stripe.
    STRIPE_PRICE_STARTER: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
    STRIPE_PRICE_PREMIUM: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
    STRIPE_PRICE_BUSINESS: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
    // URL do painel web, para onde a Stripe devolve a usuária depois do pagamento/portal.
    WEB_APP_URL: z.string().url().default('http://localhost:3001'),

    // Intervalos dos jobs recorrentes de notificação (BullMQ). Ver docs/ARCHITECTURE.md.
    NOTIFICATION_STOCK_CHECK_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
    NOTIFICATION_GOAL_CHECK_INTERVAL_MINUTES: z.coerce.number().int().positive().default(360),
    NOTIFICATION_PROMOTION_SCAN_INTERVAL_MINUTES: z.coerce.number().int().positive().default(1440),
    // Cadência por loja da notificação promocional (não é a frequência do job — o job varre
    // todo dia, cada loja só é notificada se já passou esse número de dias desde a última vez).
    NOTIFICATION_PROMOTION_INTERVAL_DAYS: z.coerce.number().int().positive().default(3),
    NOTIFICATION_GOAL_THRESHOLD_PERCENT: z.coerce.number().int().min(1).max(100).default(80),
  })
  .refine((data) => data.NODE_ENV !== 'production' || data.RESEND_API_KEY !== undefined, {
    message: 'RESEND_API_KEY é obrigatória em produção.',
    path: ['RESEND_API_KEY'],
  })
  .refine((data) => data.NODE_ENV !== 'production' || data.GOOGLE_CLIENT_ID !== undefined, {
    message: 'GOOGLE_CLIENT_ID é obrigatória em produção.',
    path: ['GOOGLE_CLIENT_ID'],
  })
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      (data.AWS_REGION &&
        data.AWS_ACCESS_KEY_ID &&
        data.AWS_SECRET_ACCESS_KEY &&
        data.S3_BUCKET_NAME &&
        data.S3_PUBLIC_BASE_URL),
    {
      message:
        'AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME e S3_PUBLIC_BASE_URL são obrigatórias em produção.',
      path: ['S3_BUCKET_NAME'],
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  throw new Error('Falha ao carregar as variáveis de ambiente. Verifique o arquivo .env.');
}

export const env = parsed.data;
export type Env = typeof env;
