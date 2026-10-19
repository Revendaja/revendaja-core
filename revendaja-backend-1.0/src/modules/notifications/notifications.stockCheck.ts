import { storeRepository, type StoreRepository } from '../store/store.repository';
import { notificationsService, type NotificationsService } from './notifications.service';

type StoreQueries = Pick<
  StoreRepository,
  'findProductsWithMinStockConfigured' | 'claimLowStockNotification' | 'resetLowStockNotification'
>;
type NotificationsQueries = Pick<NotificationsService, 'notifyUser'>;

type NewlyLowItem = { storeProductId: string; name: string; stock: number };

const NAMES_SHOWN_IN_MESSAGE = 3;

// Uma usuária pode ter vários produtos caindo abaixo do mínimo no mesmo scan (ex.: configurou o
// alerta em várias vendas de uma vez). Nesse caso manda UMA notificação resumindo todos, não uma
// por produto — sem isso, quem tem muitos produtos baixos é inundada de notificações e pushes.
function buildLowStockNotification(items: NewlyLowItem[]) {
  if (items.length === 1) {
    const [item] = items;
    return {
      type: 'STOCK_LOW' as const,
      title: 'Estoque baixo',
      message: `Seu estoque de "${item.name}" está baixo. Restam apenas ${item.stock} unidades.`,
      data: { action: 'OPEN_STOCK', storeProductId: item.storeProductId },
    };
  }

  const shownNames = items.slice(0, NAMES_SHOWN_IN_MESSAGE).map((item) => `"${item.name}"`);
  const remaining = items.length - shownNames.length;
  const namesText =
    remaining > 0
      ? `${shownNames.join(', ')} e mais ${remaining} produto${remaining > 1 ? 's' : ''}`
      : shownNames.join(', ');

  return {
    type: 'STOCK_LOW' as const,
    title: 'Estoque baixo',
    message: `${items.length} produtos estão com estoque baixo: ${namesText}.`,
    data: { action: 'OPEN_STOCK' },
  };
}

// Job `notification:stock-check`: varre produtos com `minStock > 0` configurado. Não roda dentro
// do fluxo de venda/edição de estoque — é uma varredura periódica, de propósito (ver plano de
// implementação). Anti-duplicação vem de `claimLowStockNotification` (atômico): só notifica quem
// ainda está com `lowStockNotifiedAt` nulo, e libera de novo (`resetLowStockNotification`) quando o
// estoque volta a ficar acima do mínimo.
export async function runStockCheck(
  stores: StoreQueries = storeRepository,
  notifications: NotificationsQueries = notificationsService,
): Promise<void> {
  const candidates = await stores.findProductsWithMinStockConfigured();

  // Acumula por usuária em vez de notificar dentro do loop: só sabemos se é 1 produto ou 100 depois
  // de varrer tudo (ver `buildLowStockNotification`).
  const newlyLowByUser = new Map<string, NewlyLowItem[]>();

  for (const candidate of candidates) {
    const isLow = candidate.stock <= candidate.minStock;

    if (isLow && candidate.lowStockNotifiedAt === null) {
      const claimed = await stores.claimLowStockNotification(candidate.storeProductId);
      if (!claimed) continue; // outra execução já notificou entre a busca e agora.

      const items = newlyLowByUser.get(candidate.userId) ?? [];
      items.push({
        storeProductId: candidate.storeProductId,
        name: candidate.name,
        stock: candidate.stock,
      });
      newlyLowByUser.set(candidate.userId, items);
    } else if (!isLow && candidate.lowStockNotifiedAt !== null) {
      await stores.resetLowStockNotification(candidate.storeProductId);
    }
  }

  // Se notificar falhar DEPOIS do claim (processo reiniciado no meio, erro transiente...), libera de
  // novo esses produtos em vez de deixá-los presos como "já notificados" sem ninguém ter recebido
  // nada — sem isso, só um estoque subindo e caindo de novo destrancaria o alerta. Continua pras
  // outras usuárias mesmo se uma falhar, e só relança o erro (pro job aparecer como falho nos logs)
  // depois de tentar todo mundo.
  let firstError: unknown;
  for (const [userId, items] of newlyLowByUser) {
    try {
      await notifications.notifyUser(userId, buildLowStockNotification(items));
    } catch (error) {
      await Promise.all(items.map((item) => stores.resetLowStockNotification(item.storeProductId)));
      firstError ??= error;
    }
  }
  if (firstError !== undefined) throw firstError;
}
