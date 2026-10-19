import { startPeriodicJob } from '../../shared/jobs';
import { logger } from '../../shared/logger';
import { storefrontRepository, type StorefrontRepository } from './storefront.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Options {
  // Visitas mais antigas que isso são apagadas.
  retentionDays: number;
  intervalMs?: number;
  repository?: Pick<StorefrontRepository, 'deleteVisitsBefore'>;
  now?: () => Date;
  log?: Pick<typeof logger, 'info' | 'error'>;
}

// Apaga, uma vez por dia, as visitas da vitrine mais antigas que `retentionDays` (a tabela
// `store_visits` só cresce). Roda já na subida e depois a cada `intervalMs`.
export function startVisitsCleanup({
  retentionDays,
  intervalMs = DAY_MS,
  repository = storefrontRepository,
  now = () => new Date(),
  log = logger,
}: Options): { stop: () => void } {
  return startPeriodicJob({
    name: 'limpeza de visitas da vitrine',
    intervalMs,
    log,
    run: async () => {
      const cutoff = new Date(now().getTime() - retentionDays * DAY_MS);
      const deleted = await repository.deleteVisitsBefore(cutoff);
      if (deleted > 0) {
        log.info({ deleted, retentionDays }, 'Visitas antigas da vitrine apagadas');
      }
    },
  });
}
