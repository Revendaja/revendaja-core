import { env } from '../../config/env';
// `import type` é apagado na compilação — não gera `require('expo-server-sdk')` nenhum, então não
// dispara o problema descrito abaixo. Só existe pra dar nome ao tipo do client abaixo.
import type { Expo } from 'expo-server-sdk';
import type { PushProvider, PushSendResult } from './push.types';

// `expo-server-sdk` é ESM-only; um `import` estático de VALOR dele quebra o Jest (CommonJS) mesmo
// em arquivos que nunca chegam a chamar `sendBatch` (o próprio carregamento do módulo já falha —
// mesmo problema que o projeto já teve com o Swagger UI, ver app.ts). Import dinâmico resolve: só
// carrega de fato na primeira chamada real, e o Node sabe interoperar CJS -> ESM via `import()`.
let expoClientPromise: Promise<Expo> | null = null;

async function getExpoClient() {
  expoClientPromise ??= import('expo-server-sdk').then(
    // Sem EXPO_ACCESS_TOKEN o envio ainda funciona: o Expo só exige token quando a conta tem
    // "enhanced security" ativada.
    ({ Expo }) =>
      new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : undefined),
  );
  return expoClientPromise;
}

// Implementação real, via expo-server-sdk. `chunkPushNotifications` respeita o limite de 100
// mensagens por chamada exigido pelo Expo.
export const expoPushProvider: PushProvider = {
  async sendBatch(tokens, payload) {
    const expo = await getExpoClient();
    const messages = tokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data,
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const results: PushSendResult[] = [];

    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // "Each ticket corresponds to the message at its respective index" (doc do Expo) — é assim
      // que sabemos qual token deu erro, já que o ticket em si não repete o token.
      chunk.forEach((message, index) => {
        const ticket = tickets[index];
        results.push({
          token: message.to as string,
          status: ticket.status,
          errorType: ticket.status === 'error' ? ticket.details?.error : undefined,
        });
      });
    }

    return results;
  },
};
