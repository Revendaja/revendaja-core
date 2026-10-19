import { startPeriodicJob } from '../../shared/jobs';
import { logger } from '../../shared/logger';
import { salesService, type SalesService } from './sales.service';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

interface Options {
  // Pedido online pendente há mais que isso é cancelado.
  expirationHours: number;
  intervalMs?: number;
  service?: Pick<SalesService, 'expireStaleOnlineOrders'>;
  now?: () => Date;
  log?: Pick<typeof logger, 'info' | 'error'>;
}

// Cancela sozinho, a cada 15 minutos (e já na subida), os pedidos da vitrine que ninguém pagou em
// `expirationHours` horas, devolvendo o estoque reservado. Sem isso um pedido esquecido seguraria o
// estoque para sempre.
export function startOnlineOrderExpiration({
  expirationHours,
  intervalMs = DEFAULT_INTERVAL_MS,
  service = salesService,
  now = () => new Date(),
  log = logger,
}: Options): { stop: () => void } {
  return startPeriodicJob({
    name: 'cancelamento de pedidos online esquecidos',
    intervalMs,
    log,
    run: async () => {
      const cutoff = new Date(now().getTime() - expirationHours * HOUR_MS);
      const cancelled = await service.expireStaleOnlineOrders(cutoff);
      if (cancelled > 0) {
        log.info(
          { cancelled, expirationHours },
          'Pedidos online sem pagamento cancelados; estoque devolvido',
        );
      }
    },
  });
}
