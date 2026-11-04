'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { useIsAdmin } from '@/lib/admin/hooks';
import { FullScreenLoader } from '@/components/FullScreenLoader';
import { Icon, type IconName } from '@/components/dashboard/icons';

const NAV: { label: string; href: string; icon: IconName }[] = [
  { label: 'Visão geral', href: '/admin', icon: 'grid' },
  { label: 'Lojas e clientes', href: '/admin/lojas', icon: 'store' },
  { label: 'Assistente de IA', href: '/admin/ia', icon: 'sparkle' },
  { label: 'Custos e planos', href: '/admin/custos', icon: 'chartLine' },
  { label: 'Desempenho', href: '/admin/desempenho', icon: 'chart' },
  { label: 'Sistema', href: '/admin/sistema', icon: 'lock' },
];

// Área da administradora. Exige sessão e papel `admin` (o backend confere de novo em toda rota):
// quem não é admin volta para o painel da própria loja, sem ver nada daqui.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const { isAdmin, checked } = useIsAdmin();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'signedOut' || status === 'bootError') router.replace('/login');
    else if (status === 'signedIn' && checked && !isAdmin) router.replace('/dashboard');
  }, [status, checked, isAdmin, router]);

  if (status !== 'signedIn' || !checked || !isAdmin) return <FullScreenLoader />;

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 bg-canvas px-3 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:px-4 md:py-4">
        <div className="flex items-center gap-3 px-2 pb-2 md:h-[64px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-ink-900">Administração</p>
            <p className="text-xs text-ink-400">Revendaja</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {NAV.map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-[13px] transition-colors ${
                  active
                    ? 'bg-white font-semibold text-ink-900 shadow-[0_1px_6px_rgba(16,24,40,0.08)]'
                    : 'font-medium text-ink-600 hover:bg-white/60 hover:text-ink-900'
                }`}
              >
                <Icon name={item.icon} size={18} className={active ? 'text-primary-500' : ''} />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link
          href="/dashboard"
          className="mt-auto hidden items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-ink-500 hover:bg-white/60 hover:text-ink-900 md:flex"
        >
          <Icon name="logout" size={18} className="rotate-180" />
          Voltar ao meu painel
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 p-3 md:p-4 md:pl-0">
        <main className="min-w-0 flex-1 rounded-3xl border border-ink-100 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.04)] md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
