import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { mapCatalogProduct } from '../catalog/catalog.repository';

// Consultas AGREGADAS de toda a plataforma, só para o painel da administradora (`requireAdmin`).
// Nada aqui devolve produto, venda ou cliente final: só contagens, somas e dados de contato das
// lojas (e-mail e WhatsApp da dona), que o suporte precisa.

const TZ = 'America/Sao_Paulo';

type Num = bigint | number | string | Prisma.Decimal | null;
const n = (value: Num): number => (value === null ? 0 : Number(value));

// Só contas de cliente real entram nas métricas: revisores das lojas de app (`store_review`) e contas
// internas (`internal`) ficam de fora de contagens, faturamento e consumo de IA.
const REAL_USER = Prisma.sql`u.account_type = 'standard'`;
const REAL_STORE_IDS = Prisma.sql`(SELECT s.id FROM stores s JOIN users u ON u.id = s.user_id WHERE ${REAL_USER})`;
const REAL_USER_WHERE = { accountType: 'standard' } as const;
const REAL_STORE_WHERE = { user: REAL_USER_WHERE } as const;

export interface WeekPoint {
  weekStart: Date;
  newUsers: number;
  newStores: number;
  gmv: number;
}

export interface GmvWindow {
  gross: number;
  paidSales: number;
  onlineSales: number;
  activeStores: number;
}

export interface AiTotals {
  messages: number;
  transcriptions: number;
  inputTokens: number;
  outputTokens: number;
  storesUsing: number;
}

export type StoreSort = 'created' | 'gmv' | 'ai' | 'lastSale';

export interface StoreRow {
  id: string;
  storeName: string;
  handle: string;
  plan: string;
  isOnline: boolean;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  ownerName: string;
  ownerEmail: string;
  ownerWhatsapp: string | null;
  verified: boolean;
  products: number;
  sales30d: number;
  gmv30d: number;
  lastSaleAt: Date | null;
  aiMessages: number;
  aiTokens: number;
}

export interface AiPlanRow {
  plan: string;
  stores: number;
  messages: number;
  transcriptions: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiStoreRow {
  storeId: string;
  storeName: string;
  plan: string;
  messages: number;
  transcriptions: number;
  inputTokens: number;
  outputTokens: number;
}

export const adminRepository = {
  async userCounts(since7: Date, since30: Date) {
    const [total, verified, new7d, new30d] = await Promise.all([
      prisma.user.count({ where: REAL_USER_WHERE }),
      prisma.user.count({ where: { ...REAL_USER_WHERE, phoneVerifiedAt: { not: null } } }),
      prisma.user.count({ where: { ...REAL_USER_WHERE, createdAt: { gte: since7 } } }),
      prisma.user.count({ where: { ...REAL_USER_WHERE, createdAt: { gte: since30 } } }),
    ]);
    return { total, verified, new7d, new30d };
  },

  async storeCounts(since7: Date, since30: Date) {
    const [total, online, new7d, new30d, byPlan] = await Promise.all([
      prisma.store.count({ where: REAL_STORE_WHERE }),
      prisma.store.count({ where: { ...REAL_STORE_WHERE, isOnline: true } }),
      prisma.store.count({ where: { ...REAL_STORE_WHERE, createdAt: { gte: since7 } } }),
      prisma.store.count({ where: { ...REAL_STORE_WHERE, createdAt: { gte: since30 } } }),
      prisma.store.groupBy({ by: ['plan'], where: REAL_STORE_WHERE, _count: { _all: true } }),
    ]);
    const plans = { free: 0, starter: 0, premium: 0 } as Record<string, number>;
    for (const row of byPlan) plans[row.plan] = row._count._all;
    return { total, online, new7d, new30d, byPlan: plans };
  },

  async subscriptions(now: Date, in7d: Date) {
    const [byStatus, cancelAtPeriodEnd, renewingIn7d] = await Promise.all([
      prisma.store.groupBy({
        by: ['subscriptionStatus'],
        where: REAL_STORE_WHERE,
        _count: { _all: true },
      }),
      prisma.store.count({ where: { ...REAL_STORE_WHERE, cancelAtPeriodEnd: true } }),
      prisma.store.count({
        where: {
          ...REAL_STORE_WHERE,
          currentPeriodEnd: { gte: now, lte: in7d },
          cancelAtPeriodEnd: false,
        },
      }),
    ]);
    const status: Record<string, number> = {};
    for (const row of byStatus)
      status[row.subscriptionStatus ?? 'sem_assinatura'] = row._count._all;
    return { byStatus: status, cancelAtPeriodEnd, renewingIn7d };
  },

  // Faturamento das lojas (o que ELAS venderam, não a receita do Revendaja) numa janela.
  async gmv(from: Date, to: Date): Promise<GmvWindow> {
    const [row] = await prisma.$queryRaw<{ gross: Num; paid: Num; online: Num; stores: Num }[]>`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) AS gross,
        COUNT(*) FILTER (WHERE status = 'paid') AS paid,
        COUNT(*) FILTER (WHERE status = 'paid' AND source = 'online') AS online,
        COUNT(DISTINCT store_id) FILTER (WHERE status <> 'cancelled') AS stores
      FROM sales
      WHERE created_at >= ${from} AND created_at < ${to}
        AND store_id IN ${REAL_STORE_IDS}
    `;
    return {
      gross: n(row.gross),
      paidSales: n(row.paid),
      onlineSales: n(row.online),
      activeStores: n(row.stores),
    };
  },

  // Cadastros e faturamento por semana (segunda a domingo, fuso de Brasília), das últimas `weeks`.
  async weekly(since: Date): Promise<WeekPoint[]> {
    const [users, stores, sales] = await Promise.all([
      prisma.$queryRaw<{ week: Date; c: Num }[]>`
        SELECT date_trunc('week', created_at AT TIME ZONE ${TZ}) AS week, COUNT(*) AS c
        FROM users u WHERE created_at >= ${since} AND ${REAL_USER} GROUP BY 1`,
      prisma.$queryRaw<{ week: Date; c: Num }[]>`
        SELECT date_trunc('week', created_at AT TIME ZONE ${TZ}) AS week, COUNT(*) AS c
        FROM stores WHERE created_at >= ${since} AND id IN ${REAL_STORE_IDS} GROUP BY 1`,
      prisma.$queryRaw<{ week: Date; g: Num }[]>`
        SELECT date_trunc('week', created_at AT TIME ZONE ${TZ}) AS week, SUM(total) AS g
        FROM sales WHERE created_at >= ${since} AND status = 'paid'
          AND store_id IN ${REAL_STORE_IDS} GROUP BY 1`,
    ]);
    const map = new Map<number, WeekPoint>();
    const point = (week: Date) => {
      const key = week.getTime();
      let entry = map.get(key);
      if (!entry) {
        entry = { weekStart: week, newUsers: 0, newStores: 0, gmv: 0 };
        map.set(key, entry);
      }
      return entry;
    };
    for (const row of users) point(row.week).newUsers = n(row.c);
    for (const row of stores) point(row.week).newStores = n(row.c);
    for (const row of sales) point(row.week).gmv = n(row.g);
    return [...map.values()].sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  },

  async devices() {
    const rows = await prisma.pushToken.groupBy({ by: ['platform'], _count: { _all: true } });
    const out = { ios: 0, android: 0, unknown: 0 };
    for (const row of rows) {
      if (row.platform === 'ios') out.ios = row._count._all;
      else if (row.platform === 'android') out.android = row._count._all;
      else out.unknown += row._count._all;
    }
    return out;
  },

  async catalog() {
    const [products, brands] = await Promise.all([prisma.product.count(), prisma.brand.count()]);
    return { products, brands };
  },

  async aiTotals(period: string): Promise<AiTotals> {
    const result = await prisma.aiUsage.aggregate({
      where: { period, store: REAL_STORE_WHERE },
      _sum: { messages: true, transcriptions: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    });
    return {
      messages: result._sum.messages ?? 0,
      transcriptions: result._sum.transcriptions ?? 0,
      inputTokens: result._sum.inputTokens ?? 0,
      outputTokens: result._sum.outputTokens ?? 0,
      storesUsing: result._count._all,
    };
  },

  // Histórico mensal do consumo de IA (mais recente primeiro).
  async aiHistory(limit: number) {
    const rows = await prisma.aiUsage.groupBy({
      by: ['period'],
      where: { store: REAL_STORE_WHERE },
      _sum: { messages: true, transcriptions: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
      orderBy: { period: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      period: row.period,
      messages: row._sum.messages ?? 0,
      transcriptions: row._sum.transcriptions ?? 0,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      storesUsing: row._count._all,
    }));
  },

  // Consumo de IA somado por plano: dá o uso REAL médio de cada plano (mensagens por loja).
  async aiByPlan(period: string): Promise<AiPlanRow[]> {
    const rows = await prisma.$queryRaw<
      {
        plan: string;
        stores: Num;
        messages: Num;
        transcriptions: Num;
        input_tokens: Num;
        output_tokens: Num;
      }[]
    >`
      SELECT s.plan::text AS plan,
        COUNT(*) AS stores,
        COALESCE(SUM(au.messages), 0) AS messages,
        COALESCE(SUM(au.transcriptions), 0) AS transcriptions,
        COALESCE(SUM(au.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(au.output_tokens), 0) AS output_tokens
      FROM ai_usage au
      JOIN stores s ON s.id = au.store_id
      JOIN users u ON u.id = s.user_id
      WHERE au.period = ${period} AND ${REAL_USER}
      GROUP BY s.plan
    `;
    return rows.map((row) => ({
      plan: row.plan,
      stores: n(row.stores),
      messages: n(row.messages),
      transcriptions: n(row.transcriptions),
      inputTokens: n(row.input_tokens),
      outputTokens: n(row.output_tokens),
    }));
  },

  async aiByStore(period: string, limit: number): Promise<AiStoreRow[]> {
    const rows = await prisma.aiUsage.findMany({
      where: { period, store: REAL_STORE_WHERE },
      orderBy: [{ outputTokens: 'desc' }, { messages: 'desc' }],
      take: limit,
      include: { store: { select: { storeName: true, plan: true } } },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      storeName: row.store.storeName,
      plan: row.store.plan,
      messages: row.messages,
      transcriptions: row.transcriptions,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
    }));
  },

  // Lista de lojas com o que o suporte e a gestão precisam numa linha só.
  async stores(filter: {
    search?: string;
    plan?: string;
    sort: StoreSort;
    since30: Date;
    aiPeriod: string;
    limit: number;
    offset: number;
  }): Promise<{ items: StoreRow[]; total: number }> {
    const conditions: Prisma.Sql[] = [];
    if (filter.search) {
      const like = `%${filter.search}%`;
      conditions.push(
        Prisma.sql`(s.store_name ILIKE ${like} OR s.handle ILIKE ${like} OR u.email ILIKE ${like} OR u.name ILIKE ${like})`,
      );
    }
    if (filter.plan) conditions.push(Prisma.sql`s.plan = ${filter.plan}::"Plan"`);
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const orderBy = {
      created: Prisma.sql`s.created_at DESC`,
      gmv: Prisma.sql`COALESCE(sa.gmv30, 0) DESC, s.created_at DESC`,
      ai: Prisma.sql`COALESCE(au.output_tokens, 0) DESC, s.created_at DESC`,
      lastSale: Prisma.sql`sa.last_sale_at DESC NULLS LAST, s.created_at DESC`,
    }[filter.sort];

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<
        {
          id: string;
          store_name: string;
          handle: string;
          plan: string;
          is_online: boolean;
          subscription_status: string | null;
          cancel_at_period_end: boolean;
          current_period_end: Date | null;
          created_at: Date;
          owner_name: string;
          owner_email: string;
          owner_whatsapp: string | null;
          verified: boolean;
          products: Num;
          sales30: Num;
          gmv30: Num;
          last_sale_at: Date | null;
          ai_messages: Num;
          ai_tokens: Num;
        }[]
      >`
        SELECT
          s.id, s.store_name, s.handle, s.plan::text AS plan, s.is_online, s.subscription_status,
          s.cancel_at_period_end, s.current_period_end, s.created_at,
          u.name AS owner_name, u.email AS owner_email, u.whatsapp AS owner_whatsapp,
          (u.phone_verified_at IS NOT NULL) AS verified,
          (SELECT COUNT(*) FROM store_products sp WHERE sp.store_id = s.id) AS products,
          COALESCE(sa.sales30, 0) AS sales30,
          COALESCE(sa.gmv30, 0) AS gmv30,
          sa.last_sale_at,
          COALESCE(au.messages, 0) AS ai_messages,
          COALESCE(au.input_tokens, 0) + COALESCE(au.output_tokens, 0) AS ai_tokens
        FROM stores s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN (
          SELECT store_id,
            COUNT(*) FILTER (WHERE status = 'paid' AND created_at >= ${filter.since30}) AS sales30,
            SUM(total) FILTER (WHERE status = 'paid' AND created_at >= ${filter.since30}) AS gmv30,
            MAX(created_at) FILTER (WHERE status <> 'cancelled') AS last_sale_at
          FROM sales GROUP BY store_id
        ) sa ON sa.store_id = s.id
        LEFT JOIN ai_usage au ON au.store_id = s.id AND au.period = ${filter.aiPeriod}
        ${where}
        ORDER BY ${orderBy}
        LIMIT ${filter.limit} OFFSET ${filter.offset}
      `,
      prisma.$queryRaw<{ total: Num }[]>`
        SELECT COUNT(*) AS total
        FROM stores s JOIN users u ON u.id = s.user_id
        ${where}
      `,
    ]);

    return {
      total: n(totalRows[0]?.total ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        storeName: row.store_name,
        handle: row.handle,
        plan: row.plan,
        isOnline: row.is_online,
        subscriptionStatus: row.subscription_status,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        currentPeriodEnd: row.current_period_end,
        createdAt: row.created_at,
        ownerName: row.owner_name,
        ownerEmail: row.owner_email,
        ownerWhatsapp: row.owner_whatsapp,
        verified: row.verified,
        products: n(row.products),
        sales30d: n(row.sales30),
        gmv30d: n(row.gmv30),
        lastSaleAt: row.last_sale_at,
        aiMessages: n(row.ai_messages),
        aiTokens: n(row.ai_tokens),
      })),
    };
  },

  async dbPing(): Promise<number> {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return Date.now() - start;
  },

  async migrations() {
    const rows = await prisma.$queryRaw<{ total: Num; last: string | null }[]>`
      SELECT COUNT(*) AS total, MAX(migration_name) AS last
      FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    return { applied: n(rows[0]?.total ?? 0), latest: rows[0]?.last ?? null };
  },

  // Catálogo global: escrita só pelo painel da administradora.
  async findBrandId(id: number): Promise<number | null> {
    const row = await prisma.brand.findUnique({ where: { id }, select: { id: true } });
    return row?.id ?? null;
  },

  async findProductByBarCode(barCode: string): Promise<{ id: number; name: string } | null> {
    return prisma.product.findFirst({ where: { barCode }, select: { id: true, name: true } });
  },

  async createCatalogProduct(data: {
    name: string;
    brandId: number;
    barCode?: string;
    brandSku?: string;
    description?: string;
    basePrice: number;
    productImage?: string;
  }) {
    const row = await prisma.product.create({
      data: {
        name: data.name,
        brandId: data.brandId,
        barCode: data.barCode ?? null,
        brandSku: data.brandSku ?? null,
        description: data.description ?? null,
        basePrice: data.basePrice,
        productImage: data.productImage ?? null,
        // Mesma foto nos dois tamanhos: o app usa `productImageSm` nas listas.
        productImageSm: data.productImage ?? null,
      },
      include: { brand: true },
    });
    return mapCatalogProduct(row);
  },
};
