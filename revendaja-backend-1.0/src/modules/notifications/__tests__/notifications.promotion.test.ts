import { runPromotionCheck } from '../notifications.promotion';
import { PROMOTION_TEMPLATES } from '../notifications.promotionTemplates';
import type { StorePromotionCandidate } from '../../store/store.types';

function createStoresMock() {
  return {
    findStoresDueForPromotion: jest.fn<Promise<StorePromotionCandidate[]>, [Date]>(),
    markPromotionNotified: jest.fn<Promise<unknown>, [string]>(),
  };
}

function createNotificationsMock() {
  return { notifyUser: jest.fn().mockResolvedValue(undefined) };
}

describe('runPromotionCheck', () => {
  it('busca as lojas com o corte calculado a partir do intervalo em dias', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findStoresDueForPromotion.mockResolvedValue([]);
    const before = Date.now();

    await runPromotionCheck(stores, notifications, 3);

    const cutoff = stores.findStoresDueForPromotion.mock.calls[0][0];
    const expectedCutoff = before - 3 * 24 * 60 * 60_000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedCutoff - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - 3 * 24 * 60 * 60_000 + 1000);
  });

  it('notifica cada loja devida com um template válido e marca como notificada', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findStoresDueForPromotion.mockResolvedValue([{ storeId: 'store-1', userId: 'user-1' }]);

    await runPromotionCheck(stores, notifications, 3);

    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
    const [userId, input] = notifications.notifyUser.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(input.type).toBe('PROMOTION');
    expect(PROMOTION_TEMPLATES).toContainEqual({ title: input.title, message: input.message });
    // Leva pra tela de estoque, de onde a usuária escolhe os produtos pra promoção.
    expect(input.data).toEqual({ action: 'OPEN_STOCK' });
    expect(stores.markPromotionNotified).toHaveBeenCalledWith('store-1');
  });

  it('não notifica quando nenhuma loja está devida', async () => {
    const stores = createStoresMock();
    const notifications = createNotificationsMock();
    stores.findStoresDueForPromotion.mockResolvedValue([]);

    await runPromotionCheck(stores, notifications, 3);

    expect(notifications.notifyUser).not.toHaveBeenCalled();
    expect(stores.markPromotionNotified).not.toHaveBeenCalled();
  });
});
