import { MailService } from '../mailService';
import type { MailProvider } from '../mailProvider';

const ANA = { name: 'Ana Souza', email: 'ana@email.com' };

function createProviderMock(): jest.Mocked<MailProvider> {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

describe('MailService', () => {
  it('sendWelcome envia o e-mail de boas-vindas para o endereço da usuária', async () => {
    const provider = createProviderMock();

    await new MailService(provider).sendWelcome(ANA);

    expect(provider.send).toHaveBeenCalledTimes(1);
    const message = provider.send.mock.calls[0][0];
    expect(message.to).toBe('ana@email.com');
    expect(message.subject).toContain('Boas-vindas');
    expect(message.html).toContain('Ana');
    expect(message.text).toContain('Ana');
  });

  it('sendVerificationCode envia o código informado', async () => {
    const provider = createProviderMock();

    await new MailService(provider).sendVerificationCode(ANA, '123456', { expiresInMinutes: 10 });

    const message = provider.send.mock.calls[0][0];
    expect(message.to).toBe('ana@email.com');
    expect(message.subject).toBe('Seu código de verificação do Revendaja');
    expect(message.text).toContain('123456');
  });

  it('sendVerificationCode usa o template de reenvio quando isResend é true', async () => {
    const provider = createProviderMock();

    await new MailService(provider).sendVerificationCode(ANA, '654321', {
      expiresInMinutes: 10,
      isResend: true,
    });

    expect(provider.send.mock.calls[0][0].subject).toBe(
      'Seu novo código de verificação do Revendaja',
    );
  });

  it('sendPasswordReset envia o código de redefinição', async () => {
    const provider = createProviderMock();

    await new MailService(provider).sendPasswordReset(ANA, '048213', { expiresInMinutes: 15 });

    const message = provider.send.mock.calls[0][0];
    expect(message.to).toBe('ana@email.com');
    expect(message.subject).toBe('Código para redefinir sua senha do Revendaja');
    expect(message.text).toContain('048213');
  });

  it('sendPasswordChanged envia a confirmação de alteração', async () => {
    const provider = createProviderMock();

    await new MailService(provider).sendPasswordChanged(ANA);

    expect(provider.send.mock.calls[0][0].subject).toBe('Sua senha do Revendaja foi alterada');
  });

  it('propaga o erro do provedor para quem chamou', async () => {
    const provider = createProviderMock();
    provider.send.mockRejectedValue(new Error('provedor fora do ar'));

    await expect(new MailService(provider).sendWelcome(ANA)).rejects.toThrow('provedor fora do ar');
  });
});
