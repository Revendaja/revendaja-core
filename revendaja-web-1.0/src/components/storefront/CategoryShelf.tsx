'use client';

import type { StorefrontCategory } from '@/lib/api/types';
import type { StorefrontFilter } from '@/lib/api/public';
import { Icon } from '@/components/dashboard/icons';
import { SectionHeader } from './ProductCard';
import { GridIcon } from './icons';
import { SafeImage } from './SafeImage';

// Quantos atalhos aparecem antes do "Ver tudo" (8 colunas no desktop = 7 + o "Ver tudo").
const MAX_TILES = 7;

export function isSameFilter(a: StorefrontFilter, b: StorefrontFilter) {
  return a !== null && b !== null && a.type === b.type && a.id === b.id;
}

// Atalhos de categoria. Vêm do que a loja vende (categorias próprias e marcas dos produtos).
export function CategoryShelf({
  categories,
  active,
  onSelect,
  onClear,
}: {
  categories: StorefrontCategory[];
  active: StorefrontFilter;
  onSelect: (filter: NonNullable<StorefrontFilter>) => void;
  onClear: () => void;
}) {
  const tiles = categories.slice(0, MAX_TILES);

  return (
    <section aria-label="Categorias">
      <SectionHeader title="Compre por categoria" actionLabel="Ver todos os produtos" onAction={onClear} />
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-8">
        {tiles.map((category) => {
          const filter = { type: category.type, id: category.id };
          const selected = isSameFilter(active, filter);
          return (
            <li key={`${category.type}:${category.id}`}>
              <button
                type="button"
                onClick={() => onSelect(filter)}
                aria-pressed={selected}
                className={`flex h-full w-full flex-col items-center rounded-2xl border bg-white p-2.5 text-center sm:p-3 transition hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] ${
                  selected ? 'border-primary-500 ring-2 ring-primary-100' : 'border-ink-100 hover:border-ink-200'
                }`}
              >
                <span className="flex h-16 w-full items-center justify-center sm:h-20">
                  {category.image ? (
                    <SafeImage src={category.image} className="h-full w-full object-contain" fallback={<TileIcon />} />
                  ) : (
                    <TileIcon />
                  )}
                </span>
                <span className="mt-2 line-clamp-1 text-[13px] font-semibold text-ink-900">{category.name}</span>
                <span className="text-[11px] text-ink-400">
                  {category.count} {category.count === 1 ? 'item' : 'itens'}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onClear}
            aria-pressed={active === null}
            className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white p-3 text-center transition hover:border-ink-200 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-50 text-ink-500">
              <GridIcon size={22} />
            </span>
            <span className="mt-2 text-[13px] font-semibold text-ink-900">Ver tudo</span>
            <span className="text-[11px] text-ink-400">Todos os produtos</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

function TileIcon() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-500">
      <Icon name="box" size={22} />
    </span>
  );
}
