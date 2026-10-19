// Mock manual do pacote `ioredis`, aplicado automaticamente pelo Jest a toda a suíte (mesmo
// motivo do `__mocks__/bullmq.ts` ao lado: `src/shared/queue/redis.ts` cria uma conexão de
// verdade no topo do arquivo, importada transitivamente por `app.ts`). Sem isso, todo teste que
// chama `buildApp()` tentaria abrir um socket real contra o Redis.
class IORedisMock {
  public on = jest.fn();
  public quit = jest.fn().mockResolvedValue(undefined);
  public disconnect = jest.fn();

  constructor(_url?: string, _opts?: unknown) {}
}

export default IORedisMock;
