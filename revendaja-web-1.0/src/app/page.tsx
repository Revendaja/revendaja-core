'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { postAuthPath } from '@/lib/auth/routes';
import { Hero } from '@/components/landing/Hero';
import { BrandsMarquee } from '@/components/landing/BrandsMarquee';
import { AppShowcase } from '@/components/landing/AppShowcase';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Benefits } from '@/components/landing/Benefits';
import { StorefrontPreview } from '@/components/landing/StorefrontPreview';
import { Plans } from '@/components/landing/Plans';
import { Faq } from '@/components/landing/Faq';
import { FinalCta } from '@/components/landing/FinalCta';
import { Footer } from '@/components/landing/Footer';

export default function RootPage() {
  const { status, user, isVerified, store } = useAuth();

  // A landing é pública: quem já está logado também a vê, com um atalho para continuar no app.
  const appHref = status === 'signedIn' ? postAuthPath(user?.whatsapp ?? null, isVerified, store) : null;

  return (
    <>
      <Hero appHref={appHref} />
      <BrandsMarquee />
      <AppShowcase />
      <HowItWorks />
      <Benefits />
      <StorefrontPreview />
      <Plans />
      <Faq />
      <FinalCta appHref={appHref} />
      <Footer />
    </>
  );
}
