'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StorefrontBanner } from '@/lib/api/types';
import { SafeImage } from './SafeImage';

const AUTOPLAY_MS = 6000;

// Banner do topo da vitrine: imagens de ponta a ponta com setas dos lados (como nas grandes lojas).
// Passa sozinho a cada 6 s, para quando o cliente põe o mouse/foco em cima e respeita quem pediu
// menos movimento no sistema. Cada imagem pode levar a uma parte da loja.
export function BannerCarousel({
  banners,
  storeName,
  onOpen,
}: {
  banners: StorefrontBanner[];
  storeName: string;
  onOpen: (banner: StorefrontBanner) => void;
}) {
  const count = banners.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  // Lista que encolheu (a loja trocou os banners): volta para um slide que existe.
  const current = index < count ? index : 0;

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [count, paused, reducedMotion]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques da loja"
      className="group relative overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-ink-100"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {banners.map((banner, position) => {
          const active = position === current;
          const picture = (
            <SafeImage
              src={banner.imageUrl}
              alt={`${storeName}: banner ${position + 1} de ${count}`}
              // O primeiro banner é o que aparece ao abrir a página: carrega já. Os outros esperam.
              loading={position === 0 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover"
              fallback={<span className="block h-full w-full bg-gradient-to-br from-primary-100 to-primary-50" />}
            />
          );
          return (
            <div
              key={`${position}:${banner.imageUrl}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} de ${count}`}
              // Slide fora da tela não recebe foco nem é lido pelo leitor de tela.
              inert={!active}
              aria-hidden={!active}
              className="aspect-[2/1] w-full shrink-0 sm:aspect-[16/5]"
            >
              {banner.link ? (
                <button
                  type="button"
                  onClick={() => onOpen(banner)}
                  aria-label={`Ver mais: banner ${position + 1}`}
                  className="block h-full w-full cursor-pointer"
                >
                  {picture}
                </button>
              ) : (
                picture
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <ArrowButton direction="prev" onClick={() => go(current - 1)} />
          <ArrowButton direction="next" onClick={() => go(current + 1)} />
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {banners.map((_, position) => (
              <button
                key={position}
                type="button"
                onClick={() => go(position)}
                aria-label={`Ir para o banner ${position + 1}`}
                aria-current={position === current}
                className={`h-2 rounded-full transition-all ${
                  position === current ? 'w-6 bg-white' : 'w-2 bg-white/60 hover:bg-white/90'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ArrowButton({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  const prev = direction === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={prev ? 'Banner anterior' : 'Próximo banner'}
      className={`absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-white text-ink-800 shadow-md transition hover:bg-ink-50 sm:h-10 sm:w-10 ${
        prev ? 'left-2 sm:left-4' : 'right-2 sm:right-4'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={prev ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
      </svg>
    </button>
  );
}
