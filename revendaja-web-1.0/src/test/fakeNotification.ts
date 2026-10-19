import { vi } from 'vitest';

// Substituto do `Notification` do navegador (o jsdom não tem). Guarda os alertas criados para o teste
// conferir e deixa escolher a permissão e o que o navegador responde ao pedido de permissão.
export type FakeAlert = { title: string; options?: NotificationOptions; close: () => void; onclick: (() => void) | null };

export function installFakeNotification(initial: NotificationPermission, answer: NotificationPermission = 'granted') {
  const created: FakeAlert[] = [];

  class FakeNotification {
    static permission: NotificationPermission = initial;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = answer;
      return answer;
    });

    onclick: (() => void) | null = null;
    close = vi.fn();

    constructor(
      public title: string,
      public options?: NotificationOptions,
    ) {
      created.push(this);
    }
  }

  vi.stubGlobal('Notification', FakeNotification);
  return { created, FakeNotification };
}
