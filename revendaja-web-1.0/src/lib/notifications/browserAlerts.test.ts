import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { installFakeNotification } from '@/test/fakeNotification';
import { disableBrowserAlerts, enableBrowserAlerts, useBrowserAlerts } from './browserAlerts';

describe('alertas do navegador', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navegador sem suporte a Notification: não liga e informa "unsupported"', async () => {
    vi.stubGlobal('Notification', undefined);
    delete (window as unknown as Record<string, unknown>).Notification;

    expect(await enableBrowserAlerts()).toBe('unsupported');

    const { result } = renderHook(() => useBrowserAlerts());
    expect(result.current).toMatchObject({ supported: false, enabled: false });
  });

  it('pede a permissão, e se o usuário aceita liga os alertas', async () => {
    const { FakeNotification } = installFakeNotification('default', 'granted');
    const { result } = renderHook(() => useBrowserAlerts());
    expect(result.current).toMatchObject({ supported: true, permission: 'default', enabled: false });

    let permission;
    await act(async () => {
      permission = await enableBrowserAlerts();
    });

    expect(permission).toBe('granted');
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ permission: 'granted', enabled: true });
  });

  it('se o usuário nega a permissão, não liga', async () => {
    installFakeNotification('default', 'denied');
    const { result } = renderHook(() => useBrowserAlerts());

    await act(async () => {
      expect(await enableBrowserAlerts()).toBe('denied');
    });

    expect(result.current).toMatchObject({ permission: 'denied', enabled: false });
  });

  it('já com permissão concedida, não pergunta de novo', async () => {
    const { FakeNotification } = installFakeNotification('granted');
    const { result } = renderHook(() => useBrowserAlerts());

    await act(async () => {
      await enableBrowserAlerts();
    });

    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(true);
  });

  it('desligar mantém a permissão do navegador, mas para os alertas', async () => {
    installFakeNotification('granted');
    const { result } = renderHook(() => useBrowserAlerts());
    await act(async () => {
      await enableBrowserAlerts();
    });
    expect(result.current.enabled).toBe(true);

    act(() => disableBrowserAlerts());

    expect(result.current).toMatchObject({ permission: 'granted', enabled: false });
  });

  it('permissão concedida mas sem ter ligado: continua desligado (escolha do usuário)', () => {
    installFakeNotification('granted');

    const { result } = renderHook(() => useBrowserAlerts());

    expect(result.current).toMatchObject({ permission: 'granted', enabled: false });
  });

  it('se a permissão for revogada no navegador, deixa de valer mesmo com a preferência ligada', async () => {
    const { FakeNotification } = installFakeNotification('granted');
    const { result } = renderHook(() => useBrowserAlerts());
    await act(async () => {
      await enableBrowserAlerts();
    });
    expect(result.current.enabled).toBe(true);

    FakeNotification.permission = 'denied';
    act(() => {
      // O navegador não avisa a revogação; qualquer mudança de preferência faz a leitura refletir.
      disableBrowserAlerts();
    });

    expect(result.current.enabled).toBe(false);
  });
});
