import { useEffect, useState } from 'react';

// Segundos restantes até `startedAt + durationSeconds`. Calculado a partir do relógio a cada render
// (o intervalo só dispara o re-render), então não deriva se o app ficar pausado em segundo plano.
export function useCooldown(startedAt: number | null, durationSeconds: number) {
  const [, forceRender] = useState(0);

  const remaining =
    startedAt === null ? 0 : Math.max(0, Math.ceil((startedAt + durationSeconds * 1000 - Date.now()) / 1000));
  const active = remaining > 0;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => forceRender((count) => count + 1), 1000);
    return () => clearInterval(timer);
  }, [active, startedAt]);

  return remaining;
}

// 30 -> "0:30"
export function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
