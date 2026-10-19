'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { FullScreenLoader } from '@/components/FullScreenLoader';

// Confirmar e-mail (verify-otp) e criar a loja (create-store): passos intermediários que exigem uma
// sessão válida, mas não necessariamente verificada ou com loja — cada página decide se já pode
// seguir para o próximo passo ou volta para o anterior.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signedOut' || status === 'bootError') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || status === 'signedOut' || status === 'bootError') return <FullScreenLoader />;

  return <>{children}</>;
}
