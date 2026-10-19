'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { postAuthPath } from '@/lib/auth/routes';
import { FullScreenLoader } from '@/components/FullScreenLoader';

export default function RootPage() {
  const { status, user, isVerified, store } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signedIn') router.replace(postAuthPath(user?.whatsapp ?? null, isVerified, store));
    else if (status === 'signedOut' || status === 'bootError') router.replace('/login');
  }, [status, user, isVerified, store, router]);

  return <FullScreenLoader />;
}
