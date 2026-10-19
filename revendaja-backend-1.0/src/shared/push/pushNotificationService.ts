import { logger } from '../logger';
import { expoPushProvider } from './pushProvider';
import { pushTokenRepository, type PushTokenRepository } from './pushToken.repository';
import type { PushPayload, PushProvider } from './push.types';

// Camada independente do resto do sistema (pedido explícito da spec original): só recebe tokens +
// payload, nunca sabe de quem é o token — quem resolve "quais tokens" é o worker do job
// `push:send` (ver notifications.worker.ts). Nunca lança erro para quem chamou: falha de push não
// pode derrubar o job/request que a disparou.
export class PushNotificationService {
  constructor(
    private readonly provider: PushProvider = expoPushProvider,
    private readonly tokens: Pick<PushTokenRepository, 'deleteByToken'> = pushTokenRepository,
  ) {}

  async send(recipientTokens: string[], payload: PushPayload): Promise<void> {
    if (recipientTokens.length === 0) return;

    try {
      const results = await this.provider.sendBatch(recipientTokens, payload);
      await Promise.all(
        results
          .filter(
            (result) => result.status === 'error' && result.errorType === 'DeviceNotRegistered',
          )
          .map((result) =>
            this.tokens.deleteByToken(result.token).catch((error: unknown) => {
              logger.error({ err: error }, 'Falha ao remover token de push inválido');
            }),
          ),
      );
    } catch (error) {
      logger.error({ err: error }, 'Falha ao enviar push notification');
    }
  }
}

export const pushNotificationService = new PushNotificationService();
