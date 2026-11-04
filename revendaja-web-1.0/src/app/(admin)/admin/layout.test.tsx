import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '@/test/utils';
import { ApiError } from '@/lib/api/errors';
import AdminLayout from './layout';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  replace: vi.fn(),
  auth: { status: 'signedIn' as string },
}));

vi.mock('@/lib/api/admin', () => ({ getAdminSession: () => mocks.session() }));
vi.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => '/admin',
}));

beforeEach(() => {
  mocks.session.mockReset();
  mocks.replace.mockReset();
  mocks.auth.status = 'signedIn';
});

describe('layout da administração', () => {
  it('conta comum é mandada de volta ao painel da loja e não vê o conteúdo', async () => {
    mocks.session.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Acesso restrito a administradores.'));

    renderWithQuery(
      <AdminLayout>
        <p>conteúdo secreto</p>
      </AdminLayout>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByText('conteúdo secreto')).not.toBeInTheDocument();
  });

  it('administradora vê o menu e o conteúdo', async () => {
    mocks.session.mockResolvedValue({ admin: true });

    renderWithQuery(
      <AdminLayout>
        <p>conteúdo da administração</p>
      </AdminLayout>,
    );

    expect(await screen.findByText('conteúdo da administração')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Custos e planos/ })).toHaveAttribute('href', '/admin/custos');
    expect(screen.getByRole('link', { name: /Lojas e clientes/ })).toHaveAttribute('href', '/admin/lojas');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('sem sessão vai para o login (e nem consulta a API de administração)', async () => {
    mocks.auth.status = 'signedOut';

    renderWithQuery(
      <AdminLayout>
        <p>conteúdo</p>
      </AdminLayout>,
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
    expect(mocks.session).not.toHaveBeenCalled();
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
  });
});
