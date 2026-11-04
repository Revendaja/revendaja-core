import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../shared/logger';

// Abrir uma conexão nova com o banco (TLS e login) custa várias idas e voltas até o servidor do
// banco: medido, uns 500 ms daqui até São Paulo. O padrão do `pg` fecha a conexão que fica 10 s sem
// uso, então qualquer pedido depois de uma pausa curta pagava esse custo (um /health de 60 ms virava
// 500 ms). Mantendo a conexão por 5 minutos, o pedido seguinte volta a ser de ~60 ms.
//
// O banco (Neon) pode derrubar uma conexão parada, ou o Neon suspender o computador ocioso: o pool
// descarta a conexão morta e abre outra no próximo pedido. O `keepAlive` ajuda a perceber a queda,
// e o listener de erro evita que isso derrube o processo.
//
// Uma rota que dispara várias consultas ao mesmo tempo (`Promise.all`, como /home e /store/stats)
// precisa de várias conexões abertas de uma vez. Com o pool vazio, cada uma abre a sua (~500 ms
// daqui) e a primeira chamada depois de ligar o servidor ou de uma pausa longa ficava 3 vezes mais
// lenta (/home: 735 ms na 1ª vez, 270 ms nas seguintes). Por isso o servidor abre algumas conexões
// ao ligar (ver `connectDatabase`) e o pool nunca fecha as últimas `WARM_CONNECTIONS`.
const WARM_CONNECTIONS = 4;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  idleTimeoutMillis: 5 * 60_000,
  min: WARM_CONNECTIONS,
  keepAlive: true,
});

pool.on('error', (error) => {
  logger.warn(
    { err: error },
    'Conexão ociosa com o banco foi encerrada; será aberta de novo no próximo pedido',
  );
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  await warmPool();
}

// Abre `WARM_CONNECTIONS` conexões ao mesmo tempo (pedidos simultâneos não reaproveitam a mesma). Se
// alguma falhar o servidor sobe do mesmo jeito: a conexão será aberta quando for preciso.
async function warmPool(): Promise<void> {
  const results = await Promise.allSettled(
    Array.from({ length: WARM_CONNECTIONS }, () => pool.query('SELECT 1')),
  );
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) {
    logger.warn({ failed }, 'Nem todas as conexões de aquecimento com o banco abriram');
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
