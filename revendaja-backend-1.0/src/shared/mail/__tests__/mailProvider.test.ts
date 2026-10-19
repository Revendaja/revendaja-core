const mockSend = jest.fn();
const mockResendConstructor = jest.fn();

jest.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend };

    constructor(apiKey: string) {
      mockResendConstructor(apiKey);
    }
  },
}));

import { consoleMailProvider, createResendMailProvider, mailProvider } from '../mailProvider';

const MESSAGE = {
  to: 'ana@email.com',
  subject: 'Assunto',
  html: '<p>Olá</p>',
  text: 'Olá',
};

describe('createResendMailProvider', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockResendConstructor.mockReset();
  });

  it('envia pela Resend com remetente, destinatário e as duas versões do corpo', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const provider = createResendMailProvider('re_test_key', 'Revendaja <no-reply@revendaja.com>');

    await provider.send(MESSAGE);

    expect(mockResendConstructor).toHaveBeenCalledWith('re_test_key');
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Revendaja <no-reply@revendaja.com>',
      to: 'ana@email.com',
      subject: 'Assunto',
      html: '<p>Olá</p>',
      text: 'Olá',
    });
  });

  it('lança erro quando a Resend devolve `error` (o SDK não lança sozinho)', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Domínio não verificado', statusCode: 403 },
    });
    const provider = createResendMailProvider('re_test_key', 'Revendaja <no-reply@revendaja.com>');

    await expect(provider.send(MESSAGE)).rejects.toThrow(
      /validation_error.*Domínio não verificado/,
    );
  });
});

describe('mailProvider padrão', () => {
  it('usa o provedor de console quando RESEND_API_KEY não está definida', () => {
    expect(mailProvider).toBe(consoleMailProvider);
  });

  it('o provedor de console não envia nada pela Resend', async () => {
    await consoleMailProvider.send(MESSAGE);

    expect(mockSend).not.toHaveBeenCalled();
  });
});
