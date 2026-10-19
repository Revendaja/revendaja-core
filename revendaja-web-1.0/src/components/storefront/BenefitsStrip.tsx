import type { StorefrontConfig } from '@/lib/api/types';
import { BENEFIT_ICON_COMPONENTS } from './icons';

const TILE_COLORS = [
  'bg-primary-50 text-primary-500',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-ink-100 text-ink-600',
];

// Faixa de diferenciais da loja (4 itens editáveis pela loja).
export function BenefitsStrip({ benefits }: { benefits: StorefrontConfig['benefits'] }) {
  return (
    <section aria-label="Vantagens" className="rounded-2xl border border-ink-100 bg-white px-4 py-4 md:px-6">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        {benefits.map((benefit, index) => {
          const BenefitIcon = BENEFIT_ICON_COMPONENTS[benefit.icon];
          return (
            <li key={`${benefit.title}-${index}`} className="flex items-center gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TILE_COLORS[index % TILE_COLORS.length]}`}>
                <BenefitIcon size={20} />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold text-ink-900">{benefit.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{benefit.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
