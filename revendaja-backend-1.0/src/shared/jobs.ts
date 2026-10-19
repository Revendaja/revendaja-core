import { logger } from './logger';

interface PeriodicJobOptions {
  // Nome da rotina, só para o log de falha.
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
  log?: Pick<typeof logger, 'error'>;
}

// Roda `run` já ao chamar e depois a cada `intervalMs`. Uma falha só é logada: nunca derruba o
// servidor, e a próxima rodada tenta de novo. O timer não segura o processo aberto (o servidor já
// se mantém vivo pelo `listen`). Com várias instâncias, cada uma roda a sua: as rotinas daqui são
// idempotentes, então rodar em paralelo é inofensivo.
export function startPeriodicJob({ name, intervalMs, run, log = logger }: PeriodicJobOptions): {
  stop: () => void;
} {
  async function runOnce(): Promise<void> {
    try {
      await run();
    } catch (error) {
      log.error({ err: error }, `Falha na rotina "${name}"`);
    }
  }

  void runOnce();
  const timer = setInterval(() => void runOnce(), intervalMs);
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
