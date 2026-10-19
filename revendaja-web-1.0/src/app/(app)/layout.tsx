'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { FullScreenLoader } from '@/components/FullScreenLoader';
import { BrowserAlertsWatcher } from '@/components/notifications/BrowserAlertsWatcher';

// O painel exige sessão válida, e-mail verificado e loja criada — nessa ordem. Quem não atende a
// algum requisito é mandado de volta para o passo certo do onboarding.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, isVerified, store } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const ready = status === 'signedIn' && isVerified && store !== null;

  useEffect(() => {
    if (status === 'signedOut' || status === 'bootError') router.replace('/login');
    else if (status === 'signedIn' && !isVerified) router.replace('/verify-otp');
    else if (status === 'signedIn' && isVerified && !store) router.replace('/create-store');
  }, [status, isVerified, store, router]);

  // No celular a sidebar é uma gaveta: começa fechada.
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setCollapsed(true);
  }, []);

  if (!ready) return <FullScreenLoader />;

  return (
    <div className="flex min-h-screen bg-canvas">
      <BrowserAlertsWatcher />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onClose={() => setCollapsed(true)}
      />
      <div className="flex min-w-0 flex-1 p-3 md:p-4 md:pl-0">
        <div className="flex min-w-0 flex-1 flex-col rounded-3xl border border-ink-100 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
          <Topbar collapsed={collapsed} onToggleSidebar={() => setCollapsed((c) => !c)} />
          <main className="flex-1 p-4 md:p-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
