'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/dashboard/icons';

const NAV: { label: string; href: string; icon: IconName }[] = [
  { label: 'Minha conta', href: '/conta', icon: 'user' },
  { label: 'Notificações', href: '/conta/notificacoes', icon: 'bell' },
  { label: 'Segurança', href: '/conta/seguranca', icon: 'lock' },
  { label: 'Planos', href: '/planos', icon: 'star' },
  { label: 'Assinatura', href: '/assinatura', icon: 'card' },
];

// Navegação lateral compartilhada por Minha conta, Planos e Assinatura. No celular vira uma faixa
// horizontal no topo.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex w-full flex-col gap-4 md:flex-row md:items-start">
      <nav
        aria-label="Conta"
        className="shrink-0 rounded-2xl border border-ink-100 bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.03)] md:sticky md:top-4 md:w-56"
      >
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-300 ${
                    active
                      ? 'bg-primary-50 font-semibold text-primary-600'
                      : 'font-medium text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                  }`}
                >
                  <Icon name={item.icon} size={17} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
