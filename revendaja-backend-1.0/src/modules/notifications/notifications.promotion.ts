import { env } from '../../config/env';
import { storeRepository, type StoreRepository } from '../store/store.repository';
import { pickPromotionTemplate } from './notifications.promotionTemplates';
import { notificationsService, type NotificationsService } from './notifications.service';

type StoreQueries = Pick<StoreRepository, 'findStoresDueForPromotion' | 'markPromotionNotified'>;
type NotificationsQueries = Pick<NotificationsService, 'notifyUser'>;

// Job `notification:promotion`: roda todo dia (ver NOTIFICATION_PROMOTION_SCAN_INTERVAL_MINUTES),
// mas cada loja só é notificada se já passaram `NOTIFICATION_PROMOTION_INTERVAL_DAYS` dias desde a
// última vez (ou desde a criação, se nunca notificada) — o "3 em 3 dias" é uma propriedade por
// loja, não a frequência do job em si. Sem isso, lojas criadas em datas diferentes ficariam todas
// presas ao mesmo relógio global.
export async function runPromotionCheck(
  stores: StoreQueries = storeRepository,
  notifications: NotificationsQueries = notificationsService,
  intervalDays: number = env.NOTIFICATION_PROMOTION_INTERVAL_DAYS,
): Promise<void> {
  const cutoff = new Date(Date.now() - intervalDays * 24 * 60 * 60_000);
  const candidates = await stores.findStoresDueForPromotion(cutoff);

  for (const candidate of candidates) {
    const template = pickPromotionTemplate();

    await notifications.notifyUser(candidate.userId, {
      type: 'PROMOTION',
      title: template.title,
      message: template.message,
      // A dica é sempre "escolha produtos do seu estoque pra promover" — leva pra lá, mesmo destino
      // do alerta de estoque baixo.
      data: { action: 'OPEN_STOCK' },
    });
    await stores.markPromotionNotified(candidate.storeId);
  }
}
