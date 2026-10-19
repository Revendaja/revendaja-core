const saleFindMany = jest.fn();

jest.mock('../../../database/prisma', () => ({
  prisma: { sale: { findMany: (...args: unknown[]) => saleFindMany(...args) } },
}));

import { salesRepository } from '../sales.repository';
import { startOnlineOrderExpiration } from '../sales.expiration';

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-09-24T15:00:00.000Z');

describe('salesRepository.findExpiredOnlineOrders', () => {
  it('só pedidos ONLINE, ainda PENDENTES e criados antes do corte; do mais antigo ao mais novo', async () => {
    saleFindMany.mockResolvedValue([{ id: 'sale-1', storeId: 'store-1' }]);
    const cutoff = new Date('2026-09-22T15:00:00.000Z');

    const result = await salesRepository.findExpiredOnlineOrders(cutoff, 100);

    expect(result).toEqual([{ id: 'sale-1', storeId: 'store-1' }]);
    expect(saleFindMany).toHaveBeenCalledWith({
      where: { source: 'online', status: 'pending', createdAt: { lt: cutoff } },
      select: { id: true, storeId: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  });
});

describe('startOnlineOrderExpiration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function build(
    expirationHours = 48,
    arrange: (service: { expireStaleOnlineOrders: jest.Mock }) => void = () => undefined,
  ) {
    const service = { expireStaleOnlineOrders: jest.fn().mockResolvedValue(0) };
    const log = { info: jest.fn(), error: jest.fn() };
    arrange(service);
    const job = startOnlineOrderExpiration({ expirationHours, service, now: () => NOW, log });
    return { service, log, job };
  }

  it('roda já na subida, com o corte = agora menos o prazo (48 h por padrão)', async () => {
    const { service, job } = build(48);
    await jest.advanceTimersByTimeAsync(0);

    expect(service.expireStaleOnlineOrders).toHaveBeenCalledTimes(1);
    expect(service.expireStaleOnlineOrders).toHaveBeenCalledWith(
      new Date(NOW.getTime() - 48 * HOUR_MS),
    );
    job.stop();
  });

  it('o prazo é configurável', async () => {
    const { service, job } = build(6);
    await jest.advanceTimersByTimeAsync(0);

    expect(service.expireStaleOnlineOrders).toHaveBeenCalledWith(
      new Date('2026-09-24T09:00:00.000Z'),
    );
    job.stop();
  });

  it('repete a cada 15 minutos', async () => {
    const { service, job } = build();
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(service.expireStaleOnlineOrders).toHaveBeenCalledTimes(3);
    job.stop();
  });

  it('loga quantos pedidos cancelou; se não cancelou nenhum, fica em silêncio', async () => {
    const { log, job } = build(48, (service) => {
      service.expireStaleOnlineOrders.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    });

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(
      { cancelled: 3, expirationHours: 48 },
      'Pedidos online sem pagamento cancelados; estoque devolvido',
    );
    job.stop();
  });

  it('uma falha é só logada e a próxima rodada tenta de novo', async () => {
    const { service, log, job } = build(48, (svc) => {
      svc.expireStaleOnlineOrders
        .mockRejectedValueOnce(new Error('banco fora do ar'))
        .mockResolvedValueOnce(2);
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(log.error).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(service.expireStaleOnlineOrders).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledTimes(1);
    job.stop();
  });

  it('stop() encerra a rotina', async () => {
    const { service, job } = build();
    await jest.advanceTimersByTimeAsync(0);

    job.stop();
    await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

    expect(service.expireStaleOnlineOrders).toHaveBeenCalledTimes(1);
  });
});
