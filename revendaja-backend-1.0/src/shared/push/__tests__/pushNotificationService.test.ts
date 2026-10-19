import { PushNotificationService } from '../pushNotificationService';
import type { PushProvider, PushSendResult } from '../push.types';

function createProviderMock(): jest.Mocked<PushProvider> {
  return { sendBatch: jest.fn() };
}

function createTokensMock() {
  return { deleteByToken: jest.fn().mockResolvedValue(undefined) };
}

describe('PushNotificationService', () => {
  it('não chama o provedor quando a lista de tokens está vazia', async () => {
    const provider = createProviderMock();
    const tokens = createTokensMock();
    const service = new PushNotificationService(provider, tokens);

    await service.send([], { title: 'Oi', body: 'Msg' });

    expect(provider.sendBatch).not.toHaveBeenCalled();
  });

  it('envia com sucesso e não remove nenhum token', async () => {
    const provider = createProviderMock();
    const tokens = createTokensMock();
    const results: PushSendResult[] = [{ token: 'tok-1', status: 'ok' }];
    provider.sendBatch.mockResolvedValue(results);
    const service = new PushNotificationService(provider, tokens);

    await service.send(['tok-1'], { title: 'Oi', body: 'Msg' });

    expect(provider.sendBatch).toHaveBeenCalledWith(['tok-1'], { title: 'Oi', body: 'Msg' });
    expect(tokens.deleteByToken).not.toHaveBeenCalled();
  });

  it('remove do banco o token que o provedor devolve como DeviceNotRegistered', async () => {
    const provider = createProviderMock();
    const tokens = createTokensMock();
    provider.sendBatch.mockResolvedValue([
      { token: 'tok-valido', status: 'ok' },
      { token: 'tok-invalido', status: 'error', errorType: 'DeviceNotRegistered' },
    ]);
    const service = new PushNotificationService(provider, tokens);

    await service.send(['tok-valido', 'tok-invalido'], { title: 'Oi', body: 'Msg' });

    expect(tokens.deleteByToken).toHaveBeenCalledTimes(1);
    expect(tokens.deleteByToken).toHaveBeenCalledWith('tok-invalido');
  });

  it('não remove token por outros tipos de erro (ex.: MessageRateExceeded)', async () => {
    const provider = createProviderMock();
    const tokens = createTokensMock();
    provider.sendBatch.mockResolvedValue([
      { token: 'tok-1', status: 'error', errorType: 'MessageRateExceeded' },
    ]);
    const service = new PushNotificationService(provider, tokens);

    await service.send(['tok-1'], { title: 'Oi', body: 'Msg' });

    expect(tokens.deleteByToken).not.toHaveBeenCalled();
  });

  it('nunca lança erro para quem chamou, mesmo se o provedor falhar', async () => {
    const provider = createProviderMock();
    const tokens = createTokensMock();
    provider.sendBatch.mockRejectedValue(new Error('Expo API fora do ar'));
    const service = new PushNotificationService(provider, tokens);

    await expect(service.send(['tok-1'], { title: 'Oi', body: 'Msg' })).resolves.toBeUndefined();
  });

  it('nunca lança erro para quem chamou mesmo se remover o token inválido falhar', async () => {
    const provider = createProviderMock();
    const tokens = createTokensMock();
    provider.sendBatch.mockResolvedValue([
      { token: 'tok-1', status: 'error', errorType: 'DeviceNotRegistered' },
    ]);
    tokens.deleteByToken.mockRejectedValue(new Error('Falha no banco'));
    const service = new PushNotificationService(provider, tokens);

    await expect(service.send(['tok-1'], { title: 'Oi', body: 'Msg' })).resolves.toBeUndefined();
  });
});
