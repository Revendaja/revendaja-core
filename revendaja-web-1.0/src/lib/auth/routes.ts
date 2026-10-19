import type { StoreInfo } from '../api/types';

// Para onde mandar quem está logado, dependendo de onde ficou no onboarding.
export function postAuthPath(whatsapp: string | null, isVerified: boolean, store: StoreInfo | null): string {
  // Só falta pra quem entrou pela primeira vez via Google (ver AuthContext#loginWithGoogle).
  if (!whatsapp) return '/complete-profile';
  if (!isVerified) return '/verify-otp';
  if (!store) return '/create-store';
  return '/dashboard';
}
