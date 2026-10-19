import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import SecurityPage from './page';

const mocks = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  logout: vi.fn(),
  returnToLogin: vi.fn(),
  push: vi.fn(),
  requestedAt: { current: null as number | null },
  markResetCodeRequested: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  forgotPassword: (email: string) => mocks.forgotPassword(email),
  resetPassword: (input: unknown) => mocks.resetPassword(input),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Ana Souza', email: 'ana@exemplo.com', whatsapp: null },
    logout: mocks.logout,
    returnToLogin: mocks.returnToLogin,
  }),
}));
vi.mock('next/navigation', () => {
  const router = { push: (url: string) => mocks.push(url) };
  return { useRouter: () => router };
});
// O estado do "último código pedido" é global do módulo: aqui cada teste controla o seu.
vi.mock('@/lib/auth/passwordReset', () => ({
  RESET_RESEND_COOLDOWN_SECONDS: 30,
  getResetCodeRequestedAt: () => mocks.requestedAt.current,
  markResetCodeRequested: (email: string) => mocks.markResetCodeRequested(email),
}));
// O campo real é de 6 caixinhas; aqui basta um campo de texto que entregue os dígitos.
vi.mock('@/components/auth/CodeInput', () => ({
  CODE_LENGTH: 6,
  CodeInput: ({ label, value, onChangeText, error }: { label: string; value: string; onChangeText: (v: string) => void; error?: string | null }) => (
    <div>
      <label>
        {label}
        <input aria-label="Código" value={value} onChange={(event) => onChangeText(event.target.value.replace(/\D/g, ''))} />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

async function openForm() {
  await userEvent.click(screen.getByRole('button', { name: 'Enviar código por e-mail' }));
  await screen.findByRole('button', { name: 'Alterar senha' });
}

async function fill({ code = '123456', password = 'novaSenha1', confirm }: { code?: string; password?: string; confirm?: string } = {}) {
  await userEvent.type(screen.getByLabelText('Código'), code);
  await userEvent.type(screen.getByLabelText('Nova senha'), password);
  await userEvent.type(screen.getByLabelText('Confirmar nova senha'), confirm ?? password);
}

describe('Segurança', () => {
  beforeEach(() => {
    mocks.requestedAt.current = null;
    mocks.forgotPassword.mockResolvedValue({ sent: true });
    mocks.returnToLogin.mockResolvedValue(undefined);
  });

  it('começa só com o botão de enviar código, explicando que a troca desconecta os dispositivos', () => {
    render(<SecurityPage />);

    expect(screen.getByRole('button', { name: 'Enviar código por e-mail' })).toBeInTheDocument();
    expect(screen.getByText(/ana@exemplo.com/)).toBeInTheDocument();
    expect(screen.getByText(/desconectado de todos os dispositivos/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  });

  it('envia o código para o e-mail da conta e abre o formulário', async () => {
    render(<SecurityPage />);

    await openForm();

    expect(mocks.forgotPassword).toHaveBeenCalledWith('ana@exemplo.com');
    expect(mocks.markResetCodeRequested).toHaveBeenCalledWith('ana@exemplo.com');
    expect(screen.getByText(/Enviamos um código de 6 dígitos para ana@exemplo.com/)).toBeInTheDocument();
  });

  it('mostra o erro e não abre o formulário se o envio do código falhar', async () => {
    mocks.forgotPassword.mockRejectedValue(new ApiError(429, 'TOO_MANY_REQUESTS', 'Muitas requisições. Tente novamente mais tarde.'));
    render(<SecurityPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar código por e-mail' }));

    expect(await screen.findByText('Muitas requisições. Tente novamente mais tarde.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  });

  it('já abre o formulário se um código foi pedido há pouco', () => {
    mocks.requestedAt.current = Date.now();

    render(<SecurityPage />);

    expect(screen.getByRole('button', { name: 'Alterar senha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reenviar código em/ })).toBeDisabled();
  });

  describe('validação antes de enviar', () => {
    it('exige o código de 6 dígitos', async () => {
      render(<SecurityPage />);
      await openForm();

      await fill({ code: '123' });
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

      expect(await screen.findByText(/Informe o código de 6 dígitos/)).toBeInTheDocument();
      expect(mocks.resetPassword).not.toHaveBeenCalled();
    });

    it('exige senha de 6 a 72 caracteres', async () => {
      render(<SecurityPage />);
      await openForm();

      await fill({ password: '12345' });
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

      expect(await screen.findByText('A senha deve ter entre 6 e 72 caracteres.')).toBeInTheDocument();
      expect(mocks.resetPassword).not.toHaveBeenCalled();
    });

    it('exige que a confirmação seja igual à nova senha', async () => {
      render(<SecurityPage />);
      await openForm();

      await fill({ password: 'novaSenha1', confirm: 'outraSenha2' });
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

      expect(await screen.findByText('As senhas não coincidem.')).toBeInTheDocument();
      expect(mocks.resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('trocar a senha', () => {
    it('redefine, encerra a sessão e leva ao login com aviso de sucesso', async () => {
      mocks.resetPassword.mockResolvedValue({ reset: true });
      render(<SecurityPage />);
      await openForm();

      await fill();
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

      await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login'));
      expect(mocks.resetPassword).toHaveBeenCalledWith({ email: 'ana@exemplo.com', code: '123456', password: 'novaSenha1' });
      expect(mocks.returnToLogin).toHaveBeenCalledWith({ type: 'success', message: 'Senha alterada! Entre com a sua nova senha.' });
    });

    it('código inválido: mostra o erro e limpa o campo do código', async () => {
      mocks.resetPassword.mockRejectedValue(new ApiError(400, 'PASSWORD_RESET_CODE_INVALID', 'Código inválido ou expirado.'));
      render(<SecurityPage />);
      await openForm();

      await fill();
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

      expect(await screen.findByText('Código inválido ou expirado.')).toBeInTheDocument();
      expect(screen.getByLabelText('Código')).toHaveValue('');
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it('depois de 5 códigos errados, bloqueia o envio até pedir um novo código', async () => {
      mocks.resetPassword.mockRejectedValue(new ApiError(400, 'PASSWORD_RESET_CODE_INVALID', 'Código inválido ou expirado.'));
      render(<SecurityPage />);
      await openForm();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await userEvent.type(screen.getByLabelText('Código'), '111111');
        if (attempt === 0) {
          await userEvent.type(screen.getByLabelText('Nova senha'), 'novaSenha1');
          await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'novaSenha1');
        }
        await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
        await vi.waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledTimes(attempt + 1));
      }

      expect(await screen.findByText(/atingiu o limite de tentativas/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Alterar senha' })).toBeDisabled();
    });

    it('erro inesperado do servidor aparece sem contar como código errado', async () => {
      mocks.resetPassword.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Erro no servidor. Tente novamente em instantes.'));
      render(<SecurityPage />);
      await openForm();

      await fill();
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

      expect(await screen.findByText('Erro no servidor. Tente novamente em instantes.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Alterar senha' })).toBeEnabled();
    });
  });

  it('"Sair da conta" encerra a sessão', async () => {
    render(<SecurityPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));

    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});
