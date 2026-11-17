'use client';

import { SafeImage } from './SafeImage';

// Banner de campanha entre as seções da vitrine (no lugar dos antigos cartões de coleção). A arte já
// traz o produto, então o banner todo é um botão. A arte é larga (3:1, 2172 × 724) e fica em
// `public/banners`. No celular ela é cortada num formato mais alto (16:9), centrado no frasco, para o
// produto não ficar minúsculo; a partir de `sm` (640px) aparece inteira.
const IMAGE = '/banners/essencial-desktop.webp';

export function PromoBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <section aria-label="Campanha em destaque">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Ver os produtos da campanha Natura Essencial"
        className="group block w-full cursor-pointer overflow-hidden rounded-3xl bg-ink-100 ring-1 ring-ink-100"
      >
        <span className="block aspect-[16/9] w-full sm:aspect-[3/1]">
          <SafeImage
            src={IMAGE}
            alt="Natura Essencial"
            className="h-full w-full object-cover object-[47%_50%] transition duration-700 group-hover:scale-[1.02]"
            fallback={<span className="block h-full w-full bg-gradient-to-br from-primary-100 to-primary-50" />}
          />
        </span>
      </button>
    </section>
  );
}
