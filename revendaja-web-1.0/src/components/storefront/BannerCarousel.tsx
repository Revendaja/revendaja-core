'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Carrossel infinito: a faixa tem uma cópia do último slide antes do primeiro e uma do primeiro depois
  // do último. Ao terminar a animação numa cópia, pula (sem animar) para o slide de verdade, então
  // o movimento sempre segue no mesmo sentido, sem "voltar rebobinando".
  const loop = count > 1;
  const [pos, setPos] = useState(1);
  const [jumping, setJumping] = useState(false);
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

  // Arraste (dedo ou mouse): o slide acompanha o ponteiro e, ao soltar, passa se foi o bastante.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startX: 0, moved: false, suppressClick: false });
  const trackRef = useRef<HTMLDivElement>(null);

  // Posição na faixa (com as cópias) e slide de verdade que ela representa.
  const trackPos = loop ? Math.min(Math.max(pos, 0), count + 1) : 0;
  const current = loop ? (((trackPos - 1) % count) + count) % count : 0;

  const step = useCallback((delta: number) => setPos((value) => Math.min(Math.max(value + delta, 0), count + 1)), [count]);
  const goTo = useCallback((slide: number) => setPos(slide + 1), []);

  // Chegou numa cópia: troca para o slide real sem animação.
  const settle = useCallback(() => {
    if (!loop) return;
    if (trackPos === 0 || trackPos === count + 1) {
      setJumping(true);
      setPos(trackPos === 0 ? count : 1);
    }
  }, [loop, trackPos, count]);

  useEffect(() => {
    if (!jumping) return;
    // Religa a animação só depois do navegador pintar a posição nova.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setJumping(false)));
    return () => cancelAnimationFrame(frame);
  }, [jumping]);

  // Sem animação (movimento reduzido) não existe "fim da transição": acerta a posição na hora.
  useEffect(() => {
    if (reducedMotion) settle();
  }, [reducedMotion, settle]);

  useEffect(() => {
    if (count < 2 || paused || dragging || reducedMotion) return;
    const timer = window.setInterval(() => step(1), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [count, paused, dragging, reducedMotion, step]);

  if (count === 0) return null;

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (count < 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag.current = { startX: event.clientX, moved: false, suppressClick: false };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const delta = event.clientX - drag.current.startX;
    if (!drag.current.moved) {
      if (Math.abs(delta) < 6) return;
      drag.current.moved = true;
      // Só captura o ponteiro quando virou arraste, para o clique simples no banner continuar valendo.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragX(delta);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const delta = event.clientX - drag.current.startX;
    const width = trackRef.current?.parentElement?.clientWidth ?? 300;
    const threshold = Math.min(80, width * 0.2);
    drag.current.suppressClick = drag.current.moved;
    setDragging(false);
    setDragX(0);
    if (event.type === 'pointercancel') return;
    if (delta <= -threshold) step(1);
    else if (delta >= threshold) step(-1);
    // O clique que vem logo após soltar o arraste não deve abrir o banner.
    window.setTimeout(() => (drag.current.suppressClick = false), 0);
  }

  // Só vira vertical (9:16) no celular se TODOS os banners têm a arte vertical; senão o carrossel
  // ficaria com alturas diferentes por slide. Sem arte vertical, o celular usa a larga, em quadrado.
  const portrait = banners.every((banner) => Boolean(banner.mobileImageUrl));

  const real = banners.map((banner, position) => ({ banner, position, clone: false }));
  const slides = loop
    ? [{ banner: banners[count - 1], position: count - 1, clone: true }, ...real, { banner: banners[0], position: 0, clone: true }]
    : real;

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques da loja"
      // No celular o banner é quadrado e vai de ponta a ponta da tela (sai do padding da página); no desktop volta ao formato largo.
      className="group relative -mx-4 -mt-5 overflow-hidden bg-ink-100 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:ring-1 sm:ring-ink-100"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className={`flex select-none ${dragging || jumping ? '' : 'transition-transform duration-500 ease-out motion-reduce:transition-none'} ${
          count > 1 ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ transform: `translateX(calc(-${trackPos * 100}% + ${dragX}px))`, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onTransitionEnd={(event) => event.target === event.currentTarget && settle()}
        onClickCapture={(event) => {
          if (drag.current.suppressClick) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {slides.map(({ banner, position, clone }, trackIndex) => {
          const active = trackIndex === trackPos;
          // A cópia (só para o loop) é decorativa: sem alt, para o banner não aparecer duas vezes.
          const alt = clone ? '' : `${storeName}: banner ${position + 1} de ${count}`;
          // O primeiro banner é o que aparece ao abrir a página: carrega já. Os outros esperam.
          const loading = position === 0 || clone ? 'eager' : 'lazy';
          const fallback = <span className="block h-full w-full bg-gradient-to-br from-primary-100 to-primary-50" />;
          const picture = banner.mobileImageUrl ? (
            // Celular: arte vertical. A partir de `sm` (640px): arte larga.
            <picture className="block h-full w-full">
              <source media="(min-width: 640px)" srcSet={banner.imageUrl} />
              <SafeImage src={banner.mobileImageUrl} alt={alt} loading={loading} className="pointer-events-none h-full w-full object-cover" fallback={fallback} />
            </picture>
          ) : (
            <SafeImage src={banner.imageUrl} alt={alt} loading={loading} className="pointer-events-none h-full w-full object-cover" fallback={fallback} />
          );
          return (
            <div
              key={`${trackIndex}:${banner.imageUrl}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} de ${count}`}
              // Slide fora da tela não recebe foco nem é lido pelo leitor de tela.
              inert={!active}
              aria-hidden={!active}
              className={`w-full shrink-0 sm:aspect-[3/1] ${portrait ? 'aspect-[9/16]' : 'aspect-square'}`}
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
          <ArrowButton direction="prev" onClick={() => step(-1)} />
          <ArrowButton direction="next" onClick={() => step(1)} />
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {banners.map((_, position) => (
              <button
                key={position}
                type="button"
                onClick={() => goTo(position)}
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
      className={`absolute top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-white text-ink-800 shadow-md transition hover:bg-ink-50 sm:flex sm:h-10 sm:w-10 ${
        prev ? 'left-2 sm:left-4' : 'right-2 sm:right-4'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={prev ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
      </svg>
    </button>
  );
}
