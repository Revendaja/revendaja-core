import { request } from './http';
import { buildQuery } from '../utils/dates';

// Painel de administração (rotas /admin do backend, só para contas com papel `admin`). As datas
// chegam como texto ISO.

export type AdminPlanId = 'free' | 'starter' | 'premium' | 'business';

export type AiTotals = {
  messages: number;
  transcriptions: number;
  inputTokens: number;
  outputTokens: number;
  storesUsing: number;
};

export type GmvWindow = {
  gross: number;
  paidSales: number;
  onlineSales: number;
  activeStores: number;
};

export type AdminOverview = {
  generatedAt: string;
  users: { total: number; verified: number; new7d: number; new30d: number };
  stores: {
    total: number;
    online: number;
    new7d: number;
    new30d: number;
    active30d: number;
    paying: number;
    byPlan: Record<AdminPlanId, number>;
  };
  subscriptions: {
    byStatus: Record<string, number>;
    cancelAtPeriodEnd: number;
    renewingIn7d: number;
  };
  gmv: { last30d: GmvWindow; previous30d: GmvWindow };
  weekly: { weekStart: string; newUsers: number; newStores: number; gmv: number }[];
  devices: { ios: number; android: number; unknown: number };
  catalog: { products: number; brands: number };
  ai: { period: string; previousPeriod: string; current: AiTotals; previous: AiTotals };
};

export type AdminStore = {
  id: string;
  storeName: string;
  handle: string;
  plan: AdminPlanId;
  isOnline: boolean;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  ownerWhatsapp: string | null;
  verified: boolean;
  products: number;
  sales30d: number;
  gmv30d: number;
  lastSaleAt: string | null;
  aiMessages: number;
  aiTokens: number;
};

export type AdminStoreSort = 'created' | 'gmv' | 'ai' | 'lastSale';

export type AdminStoresParams = {
  search?: string;
  plan?: AdminPlanId;
  sort: AdminStoreSort;
  page: number;
  pageSize: number;
};

export type AdminAi = {
  period: string;
  totals: AiTotals;
  history: (AiTotals & { period: string })[];
  // Consumo somado por plano (uso real médio de cada plano).
  byPlan: {
    plan: AdminPlanId;
    stores: number;
    messages: number;
    transcriptions: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  byStore: {
    storeId: string;
    storeName: string;
    plan: AdminPlanId;
    messages: number;
    transcriptions: number;
    inputTokens: number;
    outputTokens: number;
    quota: number;
    quotaUsedPercent: number;
  }[];
  model: { name: string; reasoningEffort: string };
};

export type AdminPlanLimits = {
  id: AdminPlanId;
  name: string;
  maxProducts: number | null;
  manualProductsEnabled: boolean;
  categoriesEnabled: boolean;
  promotionsEnabled: boolean;
  aiMessagesPerMonth: number;
  aiTranscriptionsPerMonth: number;
};

export type AdminSystem = {
  generatedAt: string;
  runtime: {
    environment: string;
    node: string;
    uptimeSeconds: number;
    memoryMb: number;
    storeBaseDomain: string;
  };
  ai: { model: string; reasoningEffort: string; transcribeModel: string };
  migrations: { applied: number; latest: string | null } | null;
  queue: Record<string, number> | null;
  integrations: { id: string; label: string; ok: boolean; detail: string }[];
};

export type AdminRouteStats = {
  method: string;
  route: string;
  count: number;
  serverErrors: number;
  clientErrors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  lastAt: number;
};

export type AdminLatency = {
  generatedAt: string;
  windowMinutes: number;
  uptimeSeconds: number;
  requests: number;
  serverErrors: number;
  routes: AdminRouteStats[];
  db: { medianMs: number | null; samplesMs: number[] };
};

export function getAdminSession() {
  return request<{ admin: true }>('/admin/session', { auth: true, renewOn401: true });
}

export function getAdminOverview() {
  return request<AdminOverview>('/admin/overview', { auth: true });
}

export function getAdminStores(params: AdminStoresParams) {
  return request<{ items: AdminStore[]; page: number; pageSize: number; total: number }>(
    `/admin/stores${buildQuery({ ...params })}`,
    { auth: true },
  );
}

export function getAdminAi(period?: string) {
  return request<AdminAi>(`/admin/ai${buildQuery({ period })}`, { auth: true });
}

export function getAdminPlans() {
  return request<{ plans: AdminPlanLimits[] }>('/admin/plans', { auth: true });
}

export function getAdminSystem() {
  return request<AdminSystem>('/admin/system', { auth: true });
}

export function getAdminLatency() {
  return request<AdminLatency>('/admin/latency', { auth: true });
}
