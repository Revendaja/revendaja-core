'use client';

import type { StorefrontConfig } from '@/lib/api/types';
import { Icon } from '@/components/dashboard/icons';
import { ArrowRightIcon, GiftIcon } from './icons';
import { SafeImage } from './SafeImage';

// Banner principal. Com imagem própria (enviada pela loja) ela ocupa o lado direito; sem imagem, a
// arte padrão é montada com as fotos dos produtos da loja.
export function HeroBanner({
  hero,
  images,
  maxDiscount,
  productCount,
  hasOffers,
  onPrimary,
  onSecondary,
}: {
  hero: StorefrontConfig['hero'];
  images: string[];
  maxDiscount: number;
  productCount: number;
  hasOffers: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <section
      aria-label="Destaque da loja"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-50 via-white to-ink-50 ring-1 ring-ink-100"
    >
      <div className="grid items-center gap-6 md:grid-cols-2">
        <div className="relative z-10 px-6 py-8 md:px-10 md:py-12">
          <span className="inline-block rounded-md bg-primary-100 px-2.5 py-1 text-[11px] font-bold tracking-wide text-primary-700">
            {hero.badge}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-ink-900 md:text-[44px] md:leading-[1.1]">
            {hero.title}{' '}
            <span className="block text-primary-500">{hero.highlight}</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-600 md:text-base">{hero.subtitle}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onPrimary}
              className="flex h-12 items-center gap-2 rounded-xl bg-primary-500 px-6 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(255,107,0,0.3)] transition hover:bg-primary-600"
            >
              {hero.primaryLabel}
              <ArrowRightIcon size={16} />
            </button>
            {hasOffers && (
              <button
                type="button"
                onClick={onSecondary}
                className="h-12 rounded-xl border border-ink-200 bg-white px-6 text-sm font-semibold text-ink-800 transition hover:border-primary-500 hover:text-primary-600"
              >
                {hero.secondaryLabel}
              </button>
            )}
          </div>

          {productCount > 0 && (
            <p className="mt-6 flex items-center gap-2 text-xs text-ink-500">
              <Icon name="box" size={15} className="text-primary-500" />
              <span>
                <strong className="font-semibold text-ink-800">{productCount}</strong>{' '}
                {productCount === 1 ? 'produto disponível' : 'produtos disponíveis'}
              </span>
            </p>
          )}
        </div>

        <div className="relative min-h-60 md:min-h-[360px]">
          {hero.imageUrl ? (
            <SafeImage src={hero.imageUrl} loading="eager" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <HeroArt images={images} />
          )}

          {maxDiscount > 0 && (
            <div
              aria-label={`Até ${maxDiscount}% de desconto`}
              className="absolute right-4 top-4 flex h-20 w-20 flex-col items-center justify-center rounded-full bg-primary-500 text-center text-white shadow-lg ring-4 ring-white md:right-8 md:top-8 md:h-24 md:w-24"
            >
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

// Arte padrão: fotos dos produtos sobre um "palco" circular, levemente inclinadas.
function HeroArt({ images }: { images: string[] }) {
  if (images.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-40 w-40 items-center justify-center rounded-full bg-primary-100 text-primary-500">
          <GiftIcon size={64} />
        </span>
      </div>
    );
  }

  // Posição de cada foto na composição (até 4).
  const slots = [
    'left-[8%] top-[20%] h-[46%] w-[34%] -rotate-6 z-10',
    'right-[10%] top-[8%] h-[56%] w-[38%] rotate-3 z-20',
    'left-[30%] bottom-[8%] h-[40%] w-[30%] rotate-2 z-30',
    'right-[6%] bottom-[10%] h-[34%] w-[26%] -rotate-3 z-10',
  ];

  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="absolute inset-x-[10%] bottom-[6%] h-[70%] rounded-full bg-gradient-to-b from-white to-primary-100/60 shadow-[0_20px_60px_rgba(255,107,0,0.15)]" />
      {images.slice(0, slots.length).map((src, index) => (
        <div
          key={src}
          className={`absolute flex items-center justify-center rounded-2xl bg-white p-2 shadow-[0_10px_30px_rgba(16,24,40,0.15)] ring-1 ring-ink-100 ${slots[index]}`}
        >
          <SafeImage src={src} className="h-full w-full object-contain" />
        </div>
      ))}
    </div>
  );
}
