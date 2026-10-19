import { env } from '../../config/env';
import { roundPercent, toCents } from '../sales/sales.money';
import { salesRepository, type SalesRepository } from '../sales/sales.repository';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import { notificationsRepository, type NotificationsRepository } from './notifications.repository';
import { notificationsService, type NotificationsService } from './notifications.service';

type StoreQueries = Pick<StoreRepository, 'findStoresWithMonthlyGoal'>;
type SalesQueries = Pick<SalesRepository, 'periodTotals'>;
type NotificationsRepoQueries = Pick<
  NotificationsRepository,
  'tryClaimGoalNotification' | 'deleteGoalNotificationClaim'
>;
type NotificationsQueries = Pick<NotificationsService, 'notifyUser'>;

function currentMonth(now = new Date()): { from: Date; to: Date; monthKey: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { from, to, monthKey };
}

// Job `notification:goal-check`: para cada loja com meta mensal definida, calcula o % de
// faturamento pago no mês atual e notifica 1x por mês/gatilho ao cruzar o limiar (padrão 80%). A
// tabela `StoreGoalNotification` (índice único storeId+monthKey+threshold) garante a
// anti-duplicação de forma atômica e deixa a porta aberta pra outros gatilhos no futuro.
export async function runGoalCheck(
  stores: StoreQueries = storeRepository,
  sales: SalesQueries = salesRepository,
  goalNotifications: NotificationsRepoQueries = notificationsRepository,
  notifications: NotificationsQueries = notificationsService,
  threshold: number = env.NOTIFICATION_GOAL_THRESHOLD_PERCENT,
): Promise<void> {
  const { from, to, monthKey } = currentMonth();
  const candidates = await stores.findStoresWithMonthlyGoal();

  // Cada loja é independente: uma falha ao notificar não pode abortar as seguintes (elas só
  // seriam tentadas de novo no próximo agendamento, até `NOTIFICATION_GOAL_CHECK_INTERVAL_MINUTES`
  // depois). Erros são coletados e relançados só no final, pra o job aparecer como falho nos logs
  // sem sacrificar quem já deu certo.
  let firstError: unknown;

  for (const candidate of candidates) {
    const targetCents = toCents(candidate.monthlyGoal);
    if (targetCents <= 0) continue;

    const totals = await sales.periodTotals(candidate.storeId, from, to);
    const percent = roundPercent(Math.min(100, (totals.paidCents / targetCents) * 100));
    if (percent < threshold) continue;

    const claimed = await goalNotifications.tryClaimGoalNotification(
      candidate.storeId,
      monthKey,
      threshold,
    );
    if (!claimed) continue; // já notificado esse mês/gatilho.

    try {
      await notifications.notifyUser(candidate.userId, {
        type: 'GOAL',
        title: 'Meta de vendas',
        message: `Você já alcançou ${Math.round(percent)}% da sua meta mensal! Continue assim.`,
        data: { action: 'OPEN_HOME' },
      });
    } catch (error) {
      // Falhou DEPOIS do claim: libera de novo pra tentar no próximo scan, em vez de deixar essa
      // loja presa como "já notificada" pro mês/gatilho sem ninguém ter recebido nada (mesmo
      // problema já corrigido em runStockCheck).
      await goalNotifications.deleteGoalNotificationClaim(candidate.storeId, monthKey, threshold);
      firstError ??= error;
    }
  }

  if (firstError !== undefined) throw firstError;
}
