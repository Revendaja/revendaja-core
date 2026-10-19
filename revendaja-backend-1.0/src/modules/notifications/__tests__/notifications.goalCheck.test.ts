import { runGoalCheck } from '../notifications.goalCheck';
import type { StoreGoalCandidate } from '../../store/store.types';
import type { PeriodTotals } from '../../sales/sales.types';

function createStoresMock() {
  return { findStoresWithMonthlyGoal: jest.fn<Promise<StoreGoalCandidate[]>, []>() };
}

function createSalesMock() {
  return { periodTotals: jest.fn<Promise<PeriodTotals>, [string, Date, Date, unknown?]>() };
}

function createGoalNotificationsMock() {
  return {
    tryClaimGoalNotification: jest.fn<Promise<boolean>, [string, string, number]>(),
    deleteGoalNotificationClaim: jest.fn<Promise<void>, [string, string, number]>(),
  };
}

function createNotificationsMock() {
  return { notifyUser: jest.fn().mockResolvedValue(undefined) };
}

function buildCandidate(overrides: Partial<StoreGoalCandidate> = {}): StoreGoalCandidate {
  return { storeId: 'store-1', userId: 'user-1', monthlyGoal: 1000, ...overrides };
}

describe('runGoalCheck', () => {
  it('não notifica quando o faturamento do mês ainda não cruzou o limiar', async () => {
    const stores = createStoresMock();
    const sales = createSalesMock();
    const goalNotifications = createGoalNotificationsMock();
    const notifications = createNotificationsMock();
    stores.findStoresWithMonthlyGoal.mockResolvedValue([buildCandidate()]);
    sales.periodTotals.mockResolvedValue({ paidCents: 50_000, pendingCents: 0 }); // 50% de 1000

    await runGoalCheck(stores, sales, goalNotifications, notifications, 80);

    expect(goalNotifications.tryClaimGoalNotification).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('notifica ao cruzar o limiar pela primeira vez no mês', async () => {
    const stores = createStoresMock();
    const sales = createSalesMock();
    const goalNotifications = createGoalNotificationsMock();
    const notifications = createNotificationsMock();
    stores.findStoresWithMonthlyGoal.mockResolvedValue([buildCandidate()]);
    sales.periodTotals.mockResolvedValue({ paidCents: 85_000, pendingCents: 0 }); // 85% de 1000
    goalNotifications.tryClaimGoalNotification.mockResolvedValue(true);

    await runGoalCheck(stores, sales, goalNotifications, notifications, 80);

    expect(goalNotifications.tryClaimGoalNotification).toHaveBeenCalledWith(
      'store-1',
      expect.stringMatching(/^\d{4}-\d{2}$/),
      80,
    );
    expect(notifications.notifyUser).toHaveBeenCalledWith('user-1', {
      type: 'GOAL',
      title: 'Meta de vendas',
      message: 'Você já alcançou 85% da sua meta mensal! Continue assim.',
      data: { action: 'OPEN_HOME' },
    });
  });

  it('não notifica de novo no mesmo mês (claim já reservado)', async () => {
    const stores = createStoresMock();
    const sales = createSalesMock();
    const goalNotifications = createGoalNotificationsMock();
    const notifications = createNotificationsMock();
    stores.findStoresWithMonthlyGoal.mockResolvedValue([buildCandidate()]);
    sales.periodTotals.mockResolvedValue({ paidCents: 90_000, pendingCents: 0 });
    goalNotifications.tryClaimGoalNotification.mockResolvedValue(false);

    await runGoalCheck(stores, sales, goalNotifications, notifications, 80);

    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('ignora lojas com meta zerada (sem dividir por zero)', async () => {
    const stores = createStoresMock();
    const sales = createSalesMock();
    const goalNotifications = createGoalNotificationsMock();
    const notifications = createNotificationsMock();
    stores.findStoresWithMonthlyGoal.mockResolvedValue([buildCandidate({ monthlyGoal: 0 })]);

    await runGoalCheck(stores, sales, goalNotifications, notifications, 80);

    expect(sales.periodTotals).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('notifyUser falha depois do claim: libera de novo (não fica presa como "já notificada")', async () => {
    const stores = createStoresMock();
    const sales = createSalesMock();
    const goalNotifications = createGoalNotificationsMock();
    const notifications = createNotificationsMock();
    stores.findStoresWithMonthlyGoal.mockResolvedValue([buildCandidate()]);
    sales.periodTotals.mockResolvedValue({ paidCents: 85_000, pendingCents: 0 });
    goalNotifications.tryClaimGoalNotification.mockResolvedValue(true);
    notifications.notifyUser.mockRejectedValue(new Error('processo caiu no meio'));

    await expect(runGoalCheck(stores, sales, goalNotifications, notifications, 80)).rejects.toThrow(
      'processo caiu no meio',
    );

    expect(goalNotifications.deleteGoalNotificationClaim).toHaveBeenCalledWith(
      'store-1',
      expect.stringMatching(/^\d{4}-\d{2}$/),
      80,
    );
  });

  it('falha ao notificar UMA loja não impede o processamento das outras', async () => {
    const stores = createStoresMock();
    const sales = createSalesMock();
    const goalNotifications = createGoalNotificationsMock();
    const notifications = createNotificationsMock();
    stores.findStoresWithMonthlyGoal.mockResolvedValue([
      buildCandidate({ storeId: 'store-1', userId: 'user-1' }),
      buildCandidate({ storeId: 'store-2', userId: 'user-2' }),
    ]);
    sales.periodTotals.mockResolvedValue({ paidCents: 85_000, pendingCents: 0 });
    goalNotifications.tryClaimGoalNotification.mockResolvedValue(true);
    notifications.notifyUser.mockImplementation((userId: string) =>
      userId === 'user-1' ? Promise.reject(new Error('falhou')) : Promise.resolve(undefined),
    );

    await expect(runGoalCheck(stores, sales, goalNotifications, notifications, 80)).rejects.toThrow(
      'falhou',
    );

    expect(notifications.notifyUser).toHaveBeenCalledWith('user-2', expect.anything());
    expect(goalNotifications.deleteGoalNotificationClaim).toHaveBeenCalledWith(
      'store-1',
      expect.any(String),
      80,
    );
    expect(goalNotifications.deleteGoalNotificationClaim).not.toHaveBeenCalledWith(
      'store-2',
      expect.any(String),
      80,
    );
  });
});
