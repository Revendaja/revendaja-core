import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import AccountPage from './page';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  applyUser: vi.fn(),
  push: vi.fn(),
}));

const user = { id: 'u1', name: 'Ana Souza', email: 'ana@exemplo.com', whatsapp: '5511982214432' };

vi.mock('@/lib/api/auth', () => ({ updateProfile: (changes: unknown) => mocks.updateProfile(changes) }));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ user, store: { id: 's1', createdAt: '2026-03-01T12:00:00.000Z' }, applyUser: mocks.applyUser }),
}));
vi.mock('next/navigation', () => {
  const router = { push: (url: string) => mocks.push(url) };
  return { useRouter: () => router };
});

describe('Minha conta', () => {
  beforeEach(() => {
    mocks.updateProfile.mockResolvedValue({ ...user, name: 'Ana Maria' });
  });

  it('abre com os dados atuais: nome, e-mail travado e WhatsApp com máscara', () => {
    render(<AccountPage />);

    expect(screen.getByLabelText('Seu nome')).toHaveValue('Ana Souza');
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('(11) 98221-4432');
    expect(screen.getByText(/Loja criada em/)).toBeInTheDocument();
  });

  it('manda só o que mudou e volta ao painel', async () => {
    render(<AccountPage />);
    const name = screen.getByLabelText('Seu nome');

    await userEvent.clear(name);
    await userEvent.type(name, 'Ana Maria');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.updateProfile).toHaveBeenCalledWith({ name: 'Ana Maria' });
    expect(mocks.applyUser).toHaveBeenCalledWith({ ...user, name: 'Ana Maria' });
  });

  it('troca o WhatsApp enviando só dígitos com DDI', async () => {
    render(<AccountPage />);
    const whatsapp = screen.getByLabelText('WhatsApp');

    await userEvent.clear(whatsapp);
    await userEvent.type(whatsapp, '21987654321');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await vi.waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ whatsapp: '5521987654321' }));
  });

  it('sem nenhuma mudança, não chama a API', async () => {
    render(<AccountPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith('/dashboard');
  });

  it('valida nome curto e WhatsApp incompleto', async () => {
    render(<AccountPage />);
    const name = screen.getByLabelText('Seu nome');
    const whatsapp = screen.getByLabelText('WhatsApp');

    await userEvent.clear(name);
    await userEvent.type(name, 'A');
    await userEvent.clear(whatsapp);
    await userEvent.type(whatsapp, '1198');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText(/Informe seu nome \(entre 2 e 120 caracteres\)/)).toBeInTheDocument();
    expect(screen.getByText('Informe um WhatsApp válido, com DDD.')).toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('WhatsApp já usado por outra conta: erro no próprio campo', async () => {
    mocks.updateProfile.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Conflito.'));
    render(<AccountPage />);
    const whatsapp = screen.getByLabelText('WhatsApp');

    await userEvent.clear(whatsapp);
    await userEvent.type(whatsapp, '21987654321');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Já existe uma conta com este WhatsApp.')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('erro de servidor aparece no topo do formulário', async () => {
    mocks.updateProfile.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Erro no servidor. Tente novamente em instantes.'));
    render(<AccountPage />);
    const name = screen.getByLabelText('Seu nome');

    await userEvent.clear(name);
    await userEvent.type(name, 'Ana Maria');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro no servidor. Tente novamente em instantes.');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
