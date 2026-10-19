import { NotFoundError } from '../../shared/errors/AppError';
import { fromCents, roundPercent, toCents } from '../sales/sales.money';
import { salesRepository, type SalesRepository } from '../sales/sales.repository';
import { STORE_PLAN_NAMES } from '../store/store.plans';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import type { HomeQuery } from './home.schema';
import type { Home, HomeGoal } from './home.types';

// Estoque igual ou abaixo disso entra em "produtos em baixa". Fica no servidor (e volta
// na resposta) para o app não repetir a regra.
export const LOW_STOCK_THRESHOLD = 25;
// Quantos nomes o alerta traz; o total de produtos em baixa vem em `count`.
export const LOW_STOCK_PREVIEW_LIMIT = 5;

type StoreQueries = Pick<StoreRepository, 'findByUserId' | 'getSettings' | 'findLowStock'>;
type SalesQueries = Pick<SalesRepository, 'periodTotals' | 'countPending'>;

const STORE_NOT_FOUND = 'Você ainda não possui uma loja.';

export class HomeService {
  constructor(
    private readonly stores: StoreQueries = storeRepository,
    private readonly sales: SalesQueries = salesRepository,
  ) {}

  async get(userId: string, { from, to, previousFrom }: HomeQuery): Promise<Home> {
    const store = await this.stores.findByUserId(userId);
    if (!store) {
      throw new NotFoundError(STORE_NOT_FOUND);
    }

    // Consultas independentes, disparadas em paralelo.
    const [current, previous, settings, lowStock, pendingCount] = await Promise.all([
      this.sales.periodTotals(store.id, from, to),
      this.sales.periodTotals(store.id, previousFrom, from),
      this.stores.getSettings(store.id),
      this.stores.findLowStock(store.id, LOW_STOCK_THRESHOLD, LOW_STOCK_PREVIEW_LIMIT),
      this.sales.countPending(store.id),
    ]);
    // A loja foi removida entre uma consulta e outra.
    if (!settings) {
      throw new NotFoundError(STORE_NOT_FOUND);
    }

    // Faturamento = só o que já foi PAGO.
    return {
      plan: { id: settings.plan, name: STORE_PLAN_NAMES[settings.plan] },
      revenue: {
        total: fromCents(current.paidCents),
        growthPercent: growthPercent(current.paidCents, previous.paidCents),
      },
      goal: buildGoal(settings.monthlyGoal, current.paidCents),
      alerts: {
        lowStock: {
          threshold: LOW_STOCK_THRESHOLD,
          count: lowStock.count,
          products: lowStock.products,
        },
        pendingSales: { count: pendingCount },
      },
    };
  }
}

// Sem faturamento no período anterior não há base de comparação (dividiria por zero):
// devolve null e o app esconde a seta.
function growthPercent(currentCents: number, previousCents: number): number | null {
  if (previousCents <= 0) return null;
  return roundPercent(((currentCents - previousCents) / previousCents) * 100);
}

function buildGoal(monthlyGoal: number | null, revenueCents: number): HomeGoal | null {
  if (monthlyGoal === null) return null;

  const targetCents = toCents(monthlyGoal);
  if (targetCents <= 0) return null;

  return {
    target: monthlyGoal,
    percent: roundPercent(Math.min(100, (revenueCents / targetCents) * 100)),
    remaining: fromCents(Math.max(0, targetCents - revenueCents)),
  };
}

export const homeService = new HomeService();
