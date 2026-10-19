import { runStockCheck } from '../notifications.stockCheck';
import type { LowStockCandidate } from '../../store/store.types';

function createStoresMock() {
  return {
    findProductsWithMinStockConfigured: jest.fn<Promise<LowStockCandidate[]>, []>(),
    claimLowStockNotification: jest.fn<Promise<boolean>, [string]>(),
    resetLowStockNotification: jest.fn<Promise<unknown>, [string]>(),
  };
}

function createNotificationsMock() {
  return { notifyUser: jest.fn().mockResolvedValue(undefined) };
}

function buildCandidate(overrides: Partial<LowStockCandidate> = {}): LowStockCandidate {
  return {
    storeProductId: 'sp-1',
    storeId: 'store-1',
    userId: 'user-1',
    name: 'Batom Natura',
    stock: 2,
    minStock: 3,
    lowStockNotifiedAt: null,
    ...overrides,
  };
}

describe('runStockCheck', () => {
  it('notifica quando o estoque está baixo e ainda não foi notificado', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findProductsWithMinStockConfigured.mockResolvedValue([buildCandidate()]);
    stores.claimLowStockNotification.mockResolvedValue(true);

    await runStockCheck(stores, notifications);

    expect(stores.claimLowStockNotification).toHaveBeenCalledWith('sp-1');
    expect(notifications.notifyUser).toHaveBeenCalledWith('user-1', {
      type: 'STOCK_LOW',
      title: 'Estoque baixo',
      message: 'Seu estoque de "Batom Natura" está baixo. Restam apenas 2 unidades.',
      data: { action: 'OPEN_STOCK', storeProductId: 'sp-1' },
    });
  });

  it('não notifica de novo enquanto o produto continuar abaixo do mínimo (já notificado)', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findProductsWithMinStockConfigured.mockResolvedValue([
      buildCandidate({ lowStockNotifiedAt: new Date() }),
    ]);

    await runStockCheck(stores, notifications);

    expect(stores.claimLowStockNotification).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('não notifica quando outra execução já reservou a notificação (claim atômico falha)', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findProductsWithMinStockConfigured.mockResolvedValue([buildCandidate()]);
    stores.claimLowStockNotification.mockResolvedValue(false);

    await runStockCheck(stores, notifications);

    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('libera um novo alerta (reseta) quando o estoque volta pra cima do mínimo, sem notificar', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findProductsWithMinStockConfigured.mockResolvedValue([
      buildCandidate({ stock: 10, lowStockNotifiedAt: new Date() }),
    ]);

    await runStockCheck(stores, notifications);

    expect(stores.resetLowStockNotification).toHaveBeenCalledWith('sp-1');
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('não faz nada quando o estoque está acima do mínimo e nunca foi notificado', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findProductsWithMinStockConfigured.mockResolvedValue([
      buildCandidate({ stock: 10, lowStockNotifiedAt: null }),
    ]);

    await runStockCheck(stores, notifications);

    expect(stores.resetLowStockNotification).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
    expect(stores.claimLowStockNotification).not.toHaveBeenCalled();
  });

  it('ciclo completo: baixo -> notifica -> recupera -> reseta -> cai de novo -> notifica de novo', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.claimLowStockNotification.mockResolvedValue(true);

    // 1ª rodada: estoque baixo, nunca notificado -> notifica.
    stores.findProductsWithMinStockConfigured.mockResolvedValueOnce([buildCandidate()]);
    await runStockCheck(stores, notifications);
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);

    // 2ª rodada: já notificado, ainda baixo -> não notifica de novo.
    stores.findProductsWithMinStockConfigured.mockResolvedValueOnce([
      buildCandidate({ lowStockNotifiedAt: new Date() }),
    ]);
    await runStockCheck(stores, notifications);
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);

    // 3ª rodada: recuperou -> reseta, sem notificar.
    stores.findProductsWithMinStockConfigured.mockResolvedValueOnce([
      buildCandidate({ stock: 10, lowStockNotifiedAt: new Date() }),
    ]);
    await runStockCheck(stores, notifications);
    expect(stores.resetLowStockNotification).toHaveBeenCalledWith('sp-1');
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);

    // 4ª rodada: caiu de novo (lowStockNotifiedAt já resetado) -> notifica de novo.
    stores.findProductsWithMinStockConfigured.mockResolvedValueOnce([
      buildCandidate({ lowStockNotifiedAt: null }),
    ]);
    await runStockCheck(stores, notifications);
    expect(notifications.notifyUser).toHaveBeenCalledTimes(2);
  });

  it('agrupa várias quedas da MESMA usuária no mesmo scan numa única notificação', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.claimLowStockNotification.mockResolvedValue(true);
    stores.findProductsWithMinStockConfigured.mockResolvedValue([
      buildCandidate({ storeProductId: 'sp-1', name: 'Batom Natura', stock: 2 }),
      buildCandidate({ storeProductId: 'sp-2', name: 'Kaiak 100ml', stock: 1 }),
    ]);

    await runStockCheck(stores, notifications);

    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUser).toHaveBeenCalledWith('user-1', {
      type: 'STOCK_LOW',
      title: 'Estoque baixo',
      message: '2 produtos estão com estoque baixo: "Batom Natura", "Kaiak 100ml".',
      data: { action: 'OPEN_STOCK' },
    });
  });

  it('trunca a lista de nomes quando muitos produtos caem no mesmo scan', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.claimLowStockNotification.mockResolvedValue(true);
    stores.findProductsWithMinStockConfigured.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        buildCandidate({ storeProductId: `sp-${i}`, name: `Produto ${i}`, stock: 1 }),
      ),
    );

    await runStockCheck(stores, notifications);

    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        message:
          '5 produtos estão com estoque baixo: "Produto 0", "Produto 1", "Produto 2" e mais 2 produtos.',
      }),
    );
  });

  it('notifyUser falha depois do claim: libera de novo (não fica presa como "já notificada")', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.claimLowStockNotification.mockResolvedValue(true);
    stores.findProductsWithMinStockConfigured.mockResolvedValue([buildCandidate()]);
    notifications.notifyUser.mockRejectedValue(new Error('processo caiu no meio'));

    await expect(runStockCheck(stores, notifications)).rejects.toThrow('processo caiu no meio');

    expect(stores.resetLowStockNotification).toHaveBeenCalledWith('sp-1');
  });

  it('falha ao notificar uma usuária não impede a notificação das outras', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.claimLowStockNotification.mockResolvedValue(true);
    stores.findProductsWithMinStockConfigured.mockResolvedValue([
      buildCandidate({ storeProductId: 'sp-1', userId: 'user-1' }),
      buildCandidate({ storeProductId: 'sp-2', userId: 'user-2' }),
    ]);
    notifications.notifyUser.mockImplementation((userId: string) =>
      userId === 'user-1' ? Promise.reject(new Error('falhou')) : Promise.resolve(undefined),
    );

    await expect(runStockCheck(stores, notifications)).rejects.toThrow('falhou');

    expect(notifications.notifyUser).toHaveBeenCalledWith('user-2', expect.anything());
    expect(stores.resetLowStockNotification).toHaveBeenCalledWith('sp-1');
    expect(stores.resetLowStockNotification).not.toHaveBeenCalledWith('sp-2');
  });

  it('notifica usuárias diferentes separadamente, cada uma com o próprio resumo', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.claimLowStockNotification.mockResolvedValue(true);
    stores.findProductsWithMinStockConfigured.mockResolvedValue([
      buildCandidate({ storeProductId: 'sp-1', userId: 'user-1', name: 'Batom Natura', stock: 2 }),
      buildCandidate({ storeProductId: 'sp-2', userId: 'user-2', name: 'Kaiak 100ml', stock: 1 }),
    ]);

    await runStockCheck(stores, notifications);

    expect(notifications.notifyUser).toHaveBeenCalledTimes(2);
    expect(notifications.notifyUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
      data: { action: 'OPEN_STOCK', storeProductId: 'sp-1' },
    }));
    expect(notifications.notifyUser).toHaveBeenCalledWith('user-2', expect.objectContaining({
      data: { action: 'OPEN_STOCK', storeProductId: 'sp-2' },
    }));
  });
});
