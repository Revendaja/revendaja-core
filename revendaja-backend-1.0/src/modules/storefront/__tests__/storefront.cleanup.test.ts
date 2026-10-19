import { startVisitsCleanup } from '../storefront.cleanup';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-24T15:00:00.000Z');

// `arrange` roda ANTES de o job começar: ele já dispara a primeira rodada ao ser criado.
function build(
  retentionDays = 30,
  arrange: (repository: { deleteVisitsBefore: jest.Mock }) => void = () => undefined,
) {
  const repository = { deleteVisitsBefore: jest.fn().mockResolvedValue(0) };
  const log = { info: jest.fn(), error: jest.fn() };
  arrange(repository);
  const job = startVisitsCleanup({ retentionDays, repository, now: () => NOW, log });
  return { repository, log, job };
}

describe('startVisitsCleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('roda já na subida, apagando o que é mais antigo que a retenção', async () => {
    const { repository, job } = build(30);
    await jest.advanceTimersByTimeAsync(0);

    expect(repository.deleteVisitsBefore).toHaveBeenCalledTimes(1);
    expect(repository.deleteVisitsBefore).toHaveBeenCalledWith(
      new Date('2026-08-25T15:00:00.000Z'),
    );
    job.stop();
  });

  it('a retenção é configurável (7 dias = o mínimo que a tela Minha Loja precisa)', async () => {
    const { repository, job } = build(7);
    await jest.advanceTimersByTimeAsync(0);

    expect(repository.deleteVisitsBefore).toHaveBeenCalledWith(
      new Date('2026-09-17T15:00:00.000Z'),
    );
    job.stop();
  });

  it('repete a cada 24 horas', async () => {
    const { repository, job } = build();
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(DAY_MS);
    await jest.advanceTimersByTimeAsync(DAY_MS);

    expect(repository.deleteVisitsBefore).toHaveBeenCalledTimes(3);
    job.stop();
  });

  it('stop() encerra a repetição', async () => {
    const { repository, job } = build();
    await jest.advanceTimersByTimeAsync(0);

    job.stop();
    await jest.advanceTimersByTimeAsync(3 * DAY_MS);

    expect(repository.deleteVisitsBefore).toHaveBeenCalledTimes(1);
  });

  it('loga quantas visitas apagou; se não apagou nada, não faz barulho', async () => {
    const { log, job } = build(30, (repository) => {
      repository.deleteVisitsBefore.mockResolvedValueOnce(120).mockResolvedValueOnce(0);
    });

    await jest.advanceTimersByTimeAsync(0); // 1ª rodada: apagou 120
    await jest.advanceTimersByTimeAsync(DAY_MS); // 2ª rodada: nada a apagar

    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(
      { deleted: 120, retentionDays: 30 },
      'Visitas antigas da vitrine apagadas',
    );
    job.stop();
  });

  it('uma falha é só logada: não derruba o servidor e a próxima rodada tenta de novo', async () => {
    const { repository, log, job } = build(30, (repo) => {
      repo.deleteVisitsBefore
        .mockRejectedValueOnce(new Error('banco fora do ar'))
        .mockResolvedValueOnce(5);
    });

    await jest.advanceTimersByTimeAsync(0); // 1ª rodada: falha
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.info).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(DAY_MS); // 2ª rodada: funciona

    expect(repository.deleteVisitsBefore).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledTimes(1);
    job.stop();
  });
});
