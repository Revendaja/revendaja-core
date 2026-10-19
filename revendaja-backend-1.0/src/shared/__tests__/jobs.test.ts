import { startPeriodicJob } from '../jobs';

const MINUTE = 60_000;

describe('startPeriodicJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('roda já ao começar e depois a cada intervalo', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const job = startPeriodicJob({
      name: 'teste',
      intervalMs: MINUTE,
      run,
      log: { error: jest.fn() },
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(MINUTE);
    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(run).toHaveBeenCalledTimes(3);
    job.stop();
  });

  it('stop() encerra a repetição', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const job = startPeriodicJob({
      name: 'teste',
      intervalMs: MINUTE,
      run,
      log: { error: jest.fn() },
    });
    await jest.advanceTimersByTimeAsync(0);

    job.stop();
    await jest.advanceTimersByTimeAsync(10 * MINUTE);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('uma falha é só logada, com o nome da rotina, e a próxima rodada roda normalmente', async () => {
    const error = new Error('banco fora do ar');
    const run = jest.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const log = { error: jest.fn() };
    const job = startPeriodicJob({ name: 'minha rotina', intervalMs: MINUTE, run, log });

    await jest.advanceTimersByTimeAsync(0);
    expect(log.error).toHaveBeenCalledWith({ err: error }, 'Falha na rotina "minha rotina"');

    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledTimes(1);
    job.stop();
  });

  it('não segura o processo aberto (o timer é unref)', () => {
    const unref = jest.fn();
    const spy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref } as unknown as NodeJS.Timeout);

    const job = startPeriodicJob({
      name: 'teste',
      intervalMs: MINUTE,
      run: jest.fn().mockResolvedValue(undefined),
      log: { error: jest.fn() },
    });

    expect(unref).toHaveBeenCalled();
    job.stop();
    spy.mockRestore();
  });
});
