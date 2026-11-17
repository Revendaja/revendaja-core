import type { StorefrontBrand } from '@/lib/api/types';

// Quantas logos cabem num "trilho" do letreiro: abaixo disso a lista é repetida para o trilho
// nunca ficar mais curto que a tela (senão abriria um vão no meio da animação).
const MIN_PER_ROW = 8;
// Poucas marcas ficam paradas e centralizadas: um letreiro com 2 logos girando só confunde.
const STATIC_MAX = 4;

function BrandLogo({ brand, hidden, onSelect }: { brand: StorefrontBrand; hidden: boolean; onSelect: (brand: StorefrontBrand) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(brand)}
      tabIndex={hidden ? -1 : undefined}
      aria-label={hidden ? undefined : `Ver produtos ${brand.name}`}
      title={brand.name}
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-ink-100 bg-white p-2 transition duration-300 hover:scale-110 hover:border-primary-300 md:h-[72px] md:w-[72px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- logos pequenos da marca, sem necessidade de otimização */}
      <img src={brand.logo} alt="" width={64} height={64} loading="lazy" className="h-full w-full object-contain" />
    </button>
  );
}

function Row({ brands, hidden, onSelect }: { brands: StorefrontBrand[]; hidden: boolean; onSelect: (brand: StorefrontBrand) => void }) {
  const repeats = Math.max(1, Math.ceil(MIN_PER_ROW / brands.length));
  const items = Array.from({ length: repeats }, () => brands).flat();
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-4 pr-4">
      {items.map((brand, index) => (
        <li key={`${brand.id}-${index}`}>
          <BrandLogo brand={brand} hidden={hidden || index >= brands.length} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

// Carrossel com as marcas que a loja vende (logo de cada uma). Tocar numa logo filtra os produtos da marca.
export function BrandsStrip({ brands, onSelect }: { brands: StorefrontBrand[]; onSelect: (brand: StorefrontBrand) => void }) {
  if (brands.length === 0) return null;

  return (
    <section aria-label="Marcas" className="py-2">
      <p className="mb-3 px-4 text-center text-xs font-semibold text-ink-500 md:px-6">
        {brands.length === 1 ? 'Marca da loja' : 'Marcas que você encontra aqui'}
      </p>

      {brands.length <= STATIC_MAX ? (
        <ul className="flex flex-wrap items-center justify-center gap-4 px-4">
          {brands.map((brand) => (
            <li key={brand.id}>
              <BrandLogo brand={brand} hidden={false} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="brands-marquee flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          {/* O trilho tem 4 cópias; andar 1/4 volta ao mesmo ponto (ver `brands-scroll` no globals.css). */}
          <div className="brands-track flex">
            <Row brands={brands} hidden={false} onSelect={onSelect} />
            <Row brands={brands} hidden onSelect={onSelect} />
            <Row brands={brands} hidden onSelect={onSelect} />
            <Row brands={brands} hidden onSelect={onSelect} />
          </div>
        </div>
      )}
    </section>
  );
}
