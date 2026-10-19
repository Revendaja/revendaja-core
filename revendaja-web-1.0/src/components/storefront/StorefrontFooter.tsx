import type { NewSalePaymentMethod } from '@/lib/api/types';
import { PAYMENT_CHIPS } from '@/lib/utils/sales';

export function StorefrontFooter({
  storeName,
  bio,
  acceptedPaymentMethods,
  hideBranding,
}: {
  storeName: string;
  bio: string | null;
  acceptedPaymentMethods: NewSalePaymentMethod[];
  hideBranding: boolean;
}) {
  const payments = PAYMENT_CHIPS.filter((chip) => acceptedPaymentMethods.includes(chip.method));

  return (
    <footer className="mt-12 border-t border-ink-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[1fr_auto] md:items-start">
        <div className="max-w-md">
          <p className="flex items-center gap-2.5 text-base font-bold text-ink-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-sm font-bold text-white">
              {storeName.charAt(0).toUpperCase()}
            </span>
            {storeName}
          </p>
          {bio && <p className="mt-3 text-sm leading-relaxed text-ink-500">{bio}</p>}
        </div>

        {payments.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Formas de pagamento</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {payments.map((chip) => (
                <li key={chip.method} className="rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700">
                  {chip.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 py-4 text-center text-xs text-ink-400">
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
      </div>
    </footer>
  );
}
