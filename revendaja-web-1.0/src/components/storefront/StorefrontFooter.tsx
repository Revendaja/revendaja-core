'use client';

import type { ReactNode } from 'react';
import type { NewSalePaymentMethod } from '@/lib/api/types';
import { platformUrl } from '@/lib/storefront/domain';
import { PAYMENT_CHIPS } from '@/lib/utils/sales';
import { SafeImage } from './SafeImage';

export type FooterLink = { label: string; onClick: () => void };

const LINK = 'text-sm text-ink-500 transition hover:text-primary-600';

// Coluna do rodapé: título e lista, com a barra vertical clara à esquerda.
function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-l border-ink-100/70 pl-5">
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      <ul className="mt-4 flex flex-col gap-3">{children}</ul>
    </div>
  );
}

// Rodapé da vitrine: marca da loja + chamada para comprar à esquerda; colunas de links (loja, categorias,
// pagamento e, nos planos que mostram a marca, o Revendajá) à direita; e a barra legal embaixo.
export function StorefrontFooter({
  storeName,
  logo = null,
  bio,
  acceptedPaymentMethods,
  hideBranding,
  shopLinks = [],
  categoryLinks = [],
  onShopAll,
}: {
  storeName: string;
  logo?: string | null;
  bio: string | null;
  acceptedPaymentMethods: NewSalePaymentMethod[];
  hideBranding: boolean;
  // Atalhos da loja (início, ofertas, novidades...) e das categorias: quem usa o rodapé decide o que cada um faz.
  shopLinks?: FooterLink[];
  categoryLinks?: FooterLink[];
  onShopAll?: () => void;
}) {
  const payments = PAYMENT_CHIPS.filter((chip) => acceptedPaymentMethods.includes(chip.method));
  const initial = (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-sm font-bold text-white">
      {storeName.charAt(0).toUpperCase()}
    </span>
  );

  return (
    <footer className="mt-12 border-t border-ink-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2.7fr)] lg:gap-14">
        <div className="max-w-md">
          <p className="flex items-center gap-2.5 text-lg font-bold text-ink-900">
            {logo ? (
              <SafeImage src={logo} alt="" className="h-9 w-9 rounded-lg object-contain" fallback={initial} />
            ) : (
              initial
            )}
            {storeName}
          </p>
          <p className="mt-6 text-2xl font-semibold leading-snug tracking-tight text-ink-900 md:text-[28px]">
            Faça seu pedido na {storeName}.
          </p>
          {bio && <p className="mt-3 text-sm leading-relaxed text-ink-500">{bio}</p>}
          {onShopAll && (
            <button
              type="button"
              onClick={onShopAll}
              className="group mt-6 inline-flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:border-primary-300 hover:text-primary-700"
            >
              Ver todos os produtos
              <span aria-hidden className="text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-primary-600">
                →
              </span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
          {shopLinks.length > 0 && (
            <Column title="Loja">
              {shopLinks.map((link) => (
                <li key={link.label}>
                  <button type="button" onClick={link.onClick} className={`${LINK} text-left`}>
                    {link.label}
                  </button>
                </li>
              ))}
            </Column>
          )}

          {categoryLinks.length > 0 && (
            <Column title="Categorias">
              {categoryLinks.map((link) => (
                <li key={link.label}>
                  <button type="button" onClick={link.onClick} className={`${LINK} text-left`}>
                    {link.label}
                  </button>
                </li>
              ))}
            </Column>
          )}

          {payments.length > 0 && (
            <Column title="Pagamento">
              {payments.map((chip) => (
                <li key={chip.method} className="text-sm text-ink-500">
                  {chip.label}
                </li>
              ))}
            </Column>
          )}

          {!hideBranding && (
            <Column title="Revendajá">
              <li>
                <a href="https://revendaja.com" target="_blank" rel="noopener noreferrer" className={LINK}>
                  Conheça o Revendajá
                </a>
              </li>
              <li>
                <a href={platformUrl('/register')} target="_blank" rel="noopener noreferrer" className={LINK}>
                  Crie a sua loja
                </a>
              </li>
            </Column>
          )}
        </div>
      </div>

      <div className="border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-xs text-ink-500">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <a
              href={platformUrl('/privacidade')}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-primary-600 hover:underline"
            >
              Política de privacidade
            </a>
          </div>

          <p className="text-ink-400">
            © {new Date().getFullYear()} {storeName}
            {!hideBranding && (
              <>
                {' · '}
                Loja criada com{' '}
                <a href="https://revendaja.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-600 hover:underline">
                  Revendajá
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
