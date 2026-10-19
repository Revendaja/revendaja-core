// Mock manual do pacote `bullmq`, aplicado automaticamente pelo Jest a toda a suíte (fica
// ao lado de `node_modules` do ponto de vista do `roots` configurado em jest.config.js, que é
// `<rootDir>/src` — por isso mora aqui, não na raiz do projeto).
//
// Necessário desde que o módulo de notificações existe: `src/shared/queue/queues.ts` cria uma
// `Queue` de verdade no topo do arquivo (`new Queue(...)`), e esse módulo é importado
// (transitivamente) por `app.ts` — sem este mock, TODO teste que chama `buildApp()` (store, sales,
// auth, etc., não só os de notificações) tentaria abrir uma conexão real com o Redis.
export class Queue {
  public name: string;
  public add = jest.fn().mockResolvedValue(undefined);
  public addBulk = jest.fn().mockResolvedValue(undefined);
  public upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
  public getRepeatableJobs = jest.fn().mockResolvedValue([]);
  public close = jest.fn().mockResolvedValue(undefined);

  constructor(name: string, _opts?: unknown) {
    this.name = name;
  }
}

export class Worker {
  public name: string;
  public on = jest.fn();
  public close = jest.fn().mockResolvedValue(undefined);

  constructor(name: string, _processor?: unknown, _opts?: unknown) {
    this.name = name;
  }
}
