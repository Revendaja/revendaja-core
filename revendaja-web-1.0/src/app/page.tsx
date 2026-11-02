'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { postAuthPath } from '@/lib/auth/routes';
import { FullScreenLoader } from '@/components/FullScreenLoader';
import { Hero } from '@/components/landing/Hero';
import { BrandsMarquee } from '@/components/landing/BrandsMarquee';
import { AppShowcase } from '@/components/landing/AppShowcase';

export default function RootPage() {
  const { status, user, isVerified, store } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signedIn') router.replace(postAuthPath(user?.whatsapp ?? null, isVerified, store));
      }, [status, user, isVerified, store, router]);

  // Visitante sem sessão vê a landing; quem já está logado é redirecionado acima.
  if (status === 'signedOut' || status === 'bootError') {
    return (
      <>
        <Hero />
        <BrandsMarquee />
        <AppShowcase />
      </>
    );
  }
  return <FullScreenLoader />;
}
