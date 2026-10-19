'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { postAuthPath } from '@/lib/auth/routes';
import { FullScreenLoader } from '@/components/FullScreenLoader';

// Telas de login/cadastro/recuperação de senha: quem já está logado não deve vê-las.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status, user, isVerified, store } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signedIn') router.replace(postAuthPath(user?.whatsapp ?? null, isVerified, store));
  }, [status, user, isVerified, store, router]);

  if (status === 'loading' || status === 'signedIn') return <FullScreenLoader />;

  return <>{children}</>;
}
