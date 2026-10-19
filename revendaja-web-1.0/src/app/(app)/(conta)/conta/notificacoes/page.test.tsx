import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/utils';
import { installFakeNotification } from '@/test/fakeNotification';
import NotificationSettingsPage from './page';

const mocks = vi.hoisted(() => ({ getUnreadNotificationsCount: vi.fn() }));
vi.mock('@/lib/api/notifications', () => ({
  getUnreadNotificationsCount: () => mocks.getUnreadNotificationsCount(),
}));

describe('Configurações de notificações', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('liga os alertas: pede a permissão ao navegador e o interruptor fica ligado', async () => {
    const { FakeNotification } = installFakeNotification('default', 'granted');
    renderWithQuery(<NotificationSettingsPage />);
    const toggle = screen.getByRole('switch', { name: 'Avisar neste navegador' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('se o navegador bloqueia, explica o que fazer e continua desligado', async () => {
    installFakeNotification('default', 'denied');
    renderWithQuery(<NotificationSettingsPage />);

    await userEvent.click(screen.getByRole('switch', { name: 'Avisar neste navegador' }));

    expect(await screen.findByText(/O navegador bloqueou os alertas/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Avisar neste navegador' })).toHaveAttribute('aria-checked', 'false');
  });

  it('permissão já negada antes: interruptor desabilitado com a explicação', () => {
    installFakeNotification('denied');
    renderWithQuery(<NotificationSettingsPage />);

    expect(screen.getByRole('switch', { name: 'Avisar neste navegador' })).toBeDisabled();
    expect(screen.getByText(/Bloqueado nas permissões do navegador/)).toBeInTheDocument();
  });

  it('navegador sem suporte: interruptor desabilitado', () => {
    delete (window as unknown as Record<string, unknown>).Notification;
    renderWithQuery(<NotificationSettingsPage />);

    expect(screen.getByRole('switch', { name: 'Avisar neste navegador' })).toBeDisabled();
    expect(screen.getByText('Este navegador não suporta alertas.')).toBeInTheDocument();
  });

  it('desliga os alertas', async () => {
    installFakeNotification('granted');
    window.localStorage.setItem('revendaja:browser-alerts', '1');
    renderWithQuery(<NotificationSettingsPage />);
    const toggle = screen.getByRole('switch', { name: 'Avisar neste navegador' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(toggle);

    await vi.waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('lista os tipos de aviso e leva à caixa de entrada, mostrando as não lidas', async () => {
    installFakeNotification('default');
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 3 });
    renderWithQuery(<NotificationSettingsPage />);

    for (const kind of ['Estoque baixo', 'Metas', 'Promoções', 'Avisos do Revendajá']) {
      expect(screen.getByText(kind)).toBeInTheDocument();
    }
    const link = await screen.findByRole('link', { name: 'Ver caixa de entrada (3)' });
    expect(link).toHaveAttribute('href', '/notificacoes');
  });

  it('lembra que no celular o push é ativado no app', () => {
    installFakeNotification('default');
    renderWithQuery(<NotificationSettingsPage />);

    expect(screen.getByText(/No celular, as notificações push são ativadas no app/)).toBeInTheDocument();
  });
});
