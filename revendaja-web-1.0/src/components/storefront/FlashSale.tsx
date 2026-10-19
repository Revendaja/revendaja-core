'use client';

import { useEffect, useState } from 'react';
import type { StorefrontConfig } from '@/lib/api/types';
import { pad2, splitCountdown } from '@/lib/storefront/home';
import { BoltIcon } from './icons';
import { SafeImage } from './SafeImage';

// Contagem regressiva até `endsAt`. Atualiza a cada segundo; ao zerar, `finished` fica verdadeiro.
export function useCountdown(endsAt: string | null) {
  const target = endsAt ? new Date(endsAt).getTime() : null;
  // Começa em null para o HTML do servidor e o do cliente baterem; o relógio entra depois de montar.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (target === null || now === null) return null;
  return splitCountdown(target - now);
}

export function Countdown({ endsAt }: { endsAt: string | null }) {
  const time = useCountdown(endsAt);
  if (!time || time.finished) return null;

  const units: [string, number][] = [
    ['Dias', time.days],
    ['Horas', time.hours],
    ['Min', time.minutes],
    ['Seg', time.seconds],
  ];

  return (
    <div role="timer" aria-label="Tempo restante da oferta" className="mt-5 flex gap-2.5">
      {units.map(([label, value]) => (
        <div key={label} className="flex h-16 w-14 flex-col items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
          <span className="text-xl font-extrabold tabular-nums text-white">{pad2(value)}</span>
          <span className="text-[10px] font-medium text-white/60">{label}</span>
        </div>
      ))}
    </div>
  );
}

// Faixa escura das ofertas relâmpago: título, contagem até a primeira promoção acabar e o selo de desconto.
export function FlashSale({
  flash,
  endsAt,
  images,
  maxDiscount,
  onShop,
}: {
  flash: StorefrontConfig['flash'];
  endsAt: string | null;
  images: string[];
  maxDiscount: number;
  onShop: () => void;
}) {
  return (
    <section
      aria-label={flash.title}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white"
    >
      <div className="grid items-center gap-4 md:grid-cols-2">
        <div className="relative z-10 px-6 py-8 md:px-10 md:py-10">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-300">
            <BoltIcon size={14} />
            Oferta relâmpago
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">{flash.title}</h2>
          <p className="mt-2 max-w-sm text-sm text-white/70">{flash.subtitle}</p>
          <Countdown endsAt={endsAt} />
          <button
            type="button"
            onClick={onShop}
            className="mt-6 h-11 rounded-xl bg-white px-6 text-sm font-semibold text-ink-900 transition hover:bg-primary-50"
          >
            Ver ofertas
          </button>
        </div>

        <div className="relative min-h-44 md:min-h-60">
          {flash.imageUrl ? (
            <SafeImage src={flash.imageUrl} loading="eager" className="absolute inset-0 h-full w-full object-cover opacity-90" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-end gap-3 overflow-hidden px-6 md:px-12" aria-hidden>
              <div className="absolute right-6 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-primary-500/25 blur-3xl" />
              {images.slice(0, 3).map((src, index) => (
                <div
                  key={src}
                  className={`relative flex h-28 w-24 items-center justify-center rounded-2xl bg-white/95 p-2 shadow-xl md:h-40 md:w-32 ${
                    index === 1 ? '-translate-y-3 rotate-3' : index === 2 ? 'translate-y-3 -rotate-3' : '-rotate-2'
                  }`}
                >
                  <SafeImage src={src} className="h-full w-full object-contain" />
                </div>
              ))}
            </div>
          )}
          {maxDiscount > 0 && (
            <div className="absolute right-4 top-4 flex h-20 w-20 flex-col items-center justify-center rounded-full bg-primary-500 text-center shadow-lg ring-4 ring-white/10 md:right-8 md:h-24 md:w-24">
              <span className="text-[9px] font-semibold uppercase leading-none">Até</span>
              <span className="text-2xl font-extrabold leading-none md:text-3xl">{maxDiscount}%</span>
              <span className="text-[9px] font-semibold uppercase leading-none">Off</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
