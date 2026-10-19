'use client';

import type { StorefrontConfig } from '@/lib/api/types';
import { SectionHeader } from './ProductCard';
import { SafeImage } from './SafeImage';

// Cada coleção usa uma paleta diferente (o fundo some se a loja põe a própria imagem).
const PALETTES = ['from-primary-100 via-primary-50 to-white', 'from-ink-100 via-ink-50 to-white'];

export type CollectionView = {
  collection: StorefrontConfig['collections'][number];
  // Fotos que ilustram a coleção quando a loja não enviou imagem própria.
  images: string[];
  onOpen: () => void;
};

export function CollectionBanners({ items }: { items: CollectionView[] }) {
  return (
    <section aria-label="Coleções em destaque">
      <SectionHeader title="Coleções em destaque" />
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(({ collection, images, onOpen }, index) => (
          <article
            key={`${collection.title}-${index}`}
            className={`relative flex min-h-44 overflow-hidden rounded-3xl bg-gradient-to-r ring-1 ring-ink-100 ${PALETTES[index % PALETTES.length]}`}
          >
            {collection.imageUrl && (
              <SafeImage src={collection.imageUrl} loading="eager" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {collection.imageUrl && <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/60 to-transparent" />}

            <div className="relative z-10 flex flex-1 flex-col justify-center p-6 md:p-8">
              <h3 className="text-xl font-bold tracking-tight text-ink-900 md:text-2xl">{collection.title}</h3>
              <p className="mt-1 max-w-[16rem] text-sm text-ink-600">{collection.subtitle}</p>
              <button
                type="button"
                onClick={onOpen}
                className="mt-4 h-10 w-fit rounded-lg bg-white px-4 text-xs font-semibold text-ink-900 shadow-sm ring-1 ring-ink-200 transition hover:text-primary-600 hover:ring-primary-300"
              >
                {collection.ctaLabel} →
              </button>
            </div>

            {!collection.imageUrl && images.length > 0 && (
              <div className="relative z-10 hidden items-center gap-2 pr-6 sm:flex" aria-hidden>
                {images.slice(0, 3).map((src, imageIndex) => (
                  <div
                    key={src}
                    className={`flex h-28 w-20 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-ink-100 md:h-32 md:w-24 ${
                      imageIndex === 1 ? '-translate-y-2 rotate-3' : imageIndex === 2 ? 'translate-y-2 -rotate-3' : '-rotate-2'
                    }`}
                  >
                    <SafeImage src={src} className="h-full w-full object-contain" />
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
