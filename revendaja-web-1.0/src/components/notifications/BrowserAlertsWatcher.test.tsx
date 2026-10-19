import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderWithQuery } from '@/test/utils';
import { installFakeNotification } from '@/test/fakeNotification';
import { queryKeys } from '@/lib/api/queryKeys';
import type { AppNotification } from '@/lib/api/types';
import { BrowserAlertsWatcher } from './BrowserAlertsWatcher';

const mocks = vi.hoisted(() => ({
  getUnreadNotificationsCount: vi.fn(),
  listNotifications: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api/notifications', () => ({
  getUnreadNotificationsCount: () => mocks.getUnreadNotificationsCount(),
  listNotifications: (page: number, size: number) => mocks.listNotifications(page, size),
}));
// O `useRouter` do Next devolve sempre o mesmo objeto; o mock precisa fazer igual (um objeto novo a
// cada render reiniciaria o efeito do componente e cancelaria a busca em andamento).
vi.mock('next/navigation', () => {
  const router = { push: (url: string) => mocks.push(url) };
  return { useRouter: () => router };
});

const stockAlert: AppNotification = {
  id: 'n1',
  type: 'STOCK_LOW',
  title: 'Estoque baixo',
  message: 'Batom Nude está acabando',
  data: null,
  isRead: false,
  readAt: null,
  createdAt: '2026-10-17T12:00:00.000Z',
};

function page(...items: AppNotification[]) {
  return { items, page: 1, pageSize: 1, total: items.length };
}

// Espera a primeira leitura da contagem chegar ao componente (a "linha de base"). Sem isso, uma
// atualização feita logo em seguida cancelaria a primeira leitura e o componente nunca a veria.
async function baseline(client: ReturnType<typeof renderWithQuery>['client']) {
  await waitFor(() => expect(client.getQueryData(queryKeys.unreadNotifications())).toBeDefined());
  await act(async () => {});
}

// Liga os alertas como o usuário faz (preferência salva + permissão concedida no navegador).
function enableAlerts() {
  window.localStorage.setItem('revendaja:browser-alerts', '1');
  return installFakeNotification('granted');
}

describe('BrowserAlertsWatcher', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.listNotifications.mockResolvedValue(page(stockAlert));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function arrive(client: ReturnType<typeof renderWithQuery>['client'], count: number) {
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count });
    await act(async () => {
      await client.invalidateQueries({ queryKey: queryKeys.unreadNotifications() });
    });
  }

  it('alerta com o título e o texto da mais recente quando chega notificação nova', async () => {
    const { created } = enableAlerts();
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);

    await arrive(client, 1);

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].title).toBe('Estoque baixo');
    expect(created[0].options).toMatchObject({ body: 'Batom Nude está acabando', tag: 'n1' });
    expect(mocks.listNotifications).toHaveBeenCalledWith(1, 1);
  });

  it('não alerta sobre o que já estava pendente quando o painel abre', async () => {
    const { created } = enableAlerts();
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 5 });

    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);

    expect(created).toHaveLength(0);
    expect(mocks.listNotifications).not.toHaveBeenCalled();
  });

  it('não alerta se a contagem cair ou ficar igual', async () => {
    const { created } = enableAlerts();
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 3 });
    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);

    await arrive(client, 3);
    await arrive(client, 1);

    expect(created).toHaveLength(0);
  });

  it('não alerta com os alertas desligados', async () => {
    const { created } = installFakeNotification('granted');
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);

    await arrive(client, 2);

    expect(created).toHaveLength(0);
    expect(mocks.listNotifications).not.toHaveBeenCalled();
  });

  it('não alerta sem a permissão do navegador, mesmo com a preferência ligada', async () => {
    window.localStorage.setItem('revendaja:browser-alerts', '1');
    const { created } = installFakeNotification('denied');
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);

    await arrive(client, 2);

    expect(created).toHaveLength(0);
  });

  it('não alerta se a mais recente já foi lida', async () => {
    const { created } = enableAlerts();
    mocks.listNotifications.mockResolvedValue(page({ ...stockAlert, isRead: true }));
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);

    await arrive(client, 1);
    await waitFor(() => expect(mocks.listNotifications).toHaveBeenCalled());

    expect(created).toHaveLength(0);
  });

  it('clicar no alerta foca a janela e abre a caixa de notificações', async () => {
    const { created } = enableAlerts();
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);
    await arrive(client, 1);
    await waitFor(() => expect(created).toHaveLength(1));

    created[0].onclick?.();

    expect(focus).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith('/notificacoes');
    expect(created[0].close).toHaveBeenCalled();
  });

  it('se buscar a notificação falhar, não quebra (ela continua na caixa de entrada)', async () => {
    const { created } = enableAlerts();
    mocks.listNotifications.mockRejectedValue(new Error('rede'));
    mocks.getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    const { client } = renderWithQuery(<BrowserAlertsWatcher />);
    await baseline(client);

    await arrive(client, 1);
    await waitFor(() => expect(mocks.listNotifications).toHaveBeenCalled());

    expect(created).toHaveLength(0);
  });
});
