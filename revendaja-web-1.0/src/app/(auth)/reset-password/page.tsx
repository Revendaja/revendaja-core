import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { FullScreenLoader } from '@/components/FullScreenLoader';

// `useSearchParams` (lido em ResetPasswordForm) exige um limite de Suspense.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
