import { env } from '../../config/env';
import { latencyTracker } from '../../shared/metrics/latency';
import { notificationsQueue } from '../../shared/queue/queues';
import { AI_PLAN_LIMITS } from '../ai/ai.limits';
import { usagePeriod } from '../ai/ai.period';
import { STORE_PLAN_LIMITS, STORE_PLAN_NAMES } from '../store/store.plans';
import type { StorePlan } from '../store/store.types';
import { adminRepository } from './admin.repository';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError';
import type { AdminAiQuery, AdminCreateCatalogProduct, AdminStoresQuery } from './admin.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 12;
const AI_HISTORY_MONTHS = 6;
const AI_TOP_STORES = 50;
const QUEUE_TIMEOUT_MS = 3000;

const PLAN_IDS: StorePlan[] = ['free', 'starter', 'premium'];

// "2026-11" -> "2026-10".
function previousPeriod(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export class AdminService {
  // Visão geral da empresa: clientes, receita recorrente (contagem por plano), saúde da base,
  // crescimento e consumo de IA. Os valores em R$ (preço dos planos, custo da IA) são calculados
  // no painel, a partir de preços que a administradora pode alterar no simulador.
  async overview() {
    const now = new Date();
    const since7 = new Date(now.getTime() - 7 * DAY_MS);
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since60 = new Date(now.getTime() - 60 * DAY_MS);
    const in7d = new Date(now.getTime() + 7 * DAY_MS);
    const sinceWeeks = new Date(now.getTime() - WEEKS * 7 * DAY_MS);
    const period = usagePeriod(now).key;

    const [users, stores, subscriptions, gmv30, gmvPrev30, weekly, devices, catalog, ai, aiPrev] =
      await Promise.all([
        adminRepository.userCounts(since7, since30),
        adminRepository.storeCounts(since7, since30),
        adminRepository.subscriptions(now, in7d),
        adminRepository.gmv(since30, now),
        adminRepository.gmv(since60, since30),
        adminRepository.weekly(sinceWeeks),
        adminRepository.devices(),
        adminRepository.catalog(),
        adminRepository.aiTotals(period),
        adminRepository.aiTotals(previousPeriod(period)),
      ]);

    // Quem paga: plano pago com assinatura em dia (mesma regra de `hasPlanAccess`).
    const paying = (['starter', 'premium'] as const).reduce(
      (sum, id) => sum + stores.byPlan[id],
      0,
    );

    return {
      generatedAt: now,
      users,
      stores: { ...stores, active30d: gmv30.activeStores, paying },
      subscriptions,
      gmv: { last30d: gmv30, previous30d: gmvPrev30 },
      weekly,
      devices,
      catalog,
      ai: { period, current: ai, previous: aiPrev, previousPeriod: previousPeriod(period) },
    };
  }

  async stores(query: AdminStoresQuery) {
    const now = new Date();
    const { items, total } = await adminRepository.stores({
      search: query.search,
      plan: query.plan,
      sort: query.sort,
      since30: new Date(now.getTime() - 30 * DAY_MS),
      aiPeriod: usagePeriod(now).key,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async ai(query: AdminAiQuery) {
    const period = query.period ?? usagePeriod().key;
    const [totals, history, byStore, byPlan] = await Promise.all([
      adminRepository.aiTotals(period),
      adminRepository.aiHistory(AI_HISTORY_MONTHS),
      adminRepository.aiByStore(period, AI_TOP_STORES),
      adminRepository.aiByPlan(period),
    ]);
    return {
      period,
      totals,
      history,
      byPlan,
      byStore: byStore.map((row) => {
        const plan = row.plan as StorePlan;
        const quota = AI_PLAN_LIMITS[plan]?.messagesPerMonth ?? 0;
        return {
          ...row,
          quota,
          quotaUsedPercent: quota ? Math.round((row.messages / quota) * 100) : 0,
        };
      }),
      model: { name: env.AI_MODEL, reasoningEffort: env.AI_REASONING_EFFORT },
    };
  }

  // Limites de cada plano como estão no código (o painel os mostra ao lado dos preços simulados).
  plans() {
    return PLAN_IDS.map((id) => ({
      id,
      name: STORE_PLAN_NAMES[id],
      maxProducts: STORE_PLAN_LIMITS[id].maxProducts,
      manualProductsEnabled: STORE_PLAN_LIMITS[id].manualProductsEnabled,
      categoriesEnabled: STORE_PLAN_LIMITS[id].categoriesEnabled,
      promotionsEnabled: STORE_PLAN_LIMITS[id].promotionsEnabled,
      aiMessagesPerMonth: AI_PLAN_LIMITS[id].messagesPerMonth,
      aiTranscriptionsPerMonth: AI_PLAN_LIMITS[id].transcriptionsPerMonth,
    }));
  }

  // O que está ligado e funcionando. Mostra só SE cada integração está configurada, nunca valores.
  // Tempo de resposta de cada rota da API (percentis, erros e volume) e do banco de dados.
  async latency() {
    const routes = latencyTracker.snapshot();
    const pings: number[] = [];
    for (let i = 0; i < 3; i++) {
      pings.push(await adminRepository.dbPing().catch(() => -1));
    }
    const valid = pings.filter((ms) => ms >= 0).sort((a, b) => a - b);

    return {
      generatedAt: new Date(),
      windowMinutes: latencyTracker.windowMinutes,
      uptimeSeconds: Math.round(process.uptime()),
      requests: routes.reduce((sum, route) => sum + route.count, 0),
      serverErrors: routes.reduce((sum, route) => sum + route.serverErrors, 0),
      routes,
      db: { medianMs: valid.length ? valid[Math.floor(valid.length / 2)] : null, samplesMs: pings },
    };
  }

  async system() {
    const [dbLatencyMs, migrations, queue] = await Promise.all([
      adminRepository.dbPing().catch(() => null),
      adminRepository.migrations().catch(() => null),
      withTimeout(
        notificationsQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
        QUEUE_TIMEOUT_MS,
      ).catch(() => null),
    ]);

    const integrations = [
      {
        id: 'database',
        label: 'Banco de dados',
        ok: dbLatencyMs !== null,
        detail: dbLatencyMs === null ? 'sem resposta' : `${dbLatencyMs} ms`,
      },
      {
        id: 'redis',
        label: 'Fila (Redis)',
        ok: queue !== null,
        detail: queue === null ? 'sem resposta' : 'conectada',
      },
      {
        id: 'openai',
        label: 'Assistente de IA (OpenAI)',
        ok: Boolean(env.OPENAI_API_KEY),
        detail: env.AI_MODEL,
      },
      { id: 'stripe', label: 'Cobrança (Stripe)', ok: Boolean(env.STRIPE_SECRET_KEY), detail: '' },
      {
        id: 'stripeWebhook',
        label: 'Webhook da Stripe',
        ok: Boolean(env.STRIPE_WEBHOOK_SECRET),
        detail: '',
      },
      {
        id: 'stripePrices',
        label: 'Preços dos planos na Stripe',
        ok: Boolean(env.STRIPE_PRICE_STARTER && env.STRIPE_PRICE_PREMIUM),
        detail: '',
      },
      {
        id: 'resend',
        label: 'E-mail (Resend)',
        ok: Boolean(env.RESEND_API_KEY),
        detail: env.MAIL_FROM,
      },
      {
        id: 's3',
        label: 'Imagens (S3)',
        ok: Boolean(
          env.AWS_REGION &&
          env.AWS_ACCESS_KEY_ID &&
          env.AWS_SECRET_ACCESS_KEY &&
          env.S3_BUCKET_NAME &&
          env.S3_PUBLIC_BASE_URL,
        ),
        detail: '',
      },
      { id: 'google', label: 'Login com Google', ok: Boolean(env.GOOGLE_CLIENT_ID), detail: '' },
      {
        id: 'expo',
        label: 'Notificações push (token Expo)',
        ok: Boolean(env.EXPO_ACCESS_TOKEN),
        detail: 'opcional',
      },
    ];

    return {
      generatedAt: new Date(),
      runtime: {
        environment: env.NODE_ENV,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        storeBaseDomain: env.STORE_BASE_DOMAIN,
      },
      ai: {
        model: env.AI_MODEL,
        reasoningEffort: env.AI_REASONING_EFFORT,
        transcribeModel: env.AI_TRANSCRIBE_MODEL,
      },
      migrations,
      queue,
      integrations,
    };
  }

  // Cadastra um produto no catálogo global (visível para todas as lojas).
  async createCatalogProduct(input: AdminCreateCatalogProduct) {
    if (!(await adminRepository.findBrandId(input.brandId))) {
      throw new NotFoundError('Marca não encontrada.');
    }
    if (input.barCode) {
      const existing = await adminRepository.findProductByBarCode(input.barCode);
      if (existing) {
        throw new ConflictError(
          `Já existe um produto com esse código de barras: ${existing.name} (#${existing.id}).`,
        );
      }
    }
    return adminRepository.createCatalogProduct(input);
  }
}

export const adminService = new AdminService();
