'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell, AuthIcon } from '@/components/auth/AuthShell';
import { Banner } from '@/components/auth/Banner';
import { Field } from '@/components/auth/Field';
import { PrimaryButton } from '@/components/auth/Button';
import { forgotPassword } from '@/lib/api/auth';
import { getErrorMessage } from '@/lib/api/errors';
import { isInResetCooldown, markResetCodeRequested } from '@/lib/auth/passwordReset';
import { useSubmitting } from '@/hooks/useSubmitting';
import { isValidEmail, normalizeEmail } from '@/lib/utils/validation';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { loading, run } = useSubmitting();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!isValidEmail(email)) {
      setEmailError('Informe um e-mail válido.');
      return;
    }
    setEmailError(null);
    const normalized = normalizeEmail(email);

    // Já pedimos um código para este e-mail há menos de 30s: a API ignoraria o pedido em silêncio.
    // O código anterior continua valendo, então só seguimos para a tela de digitar o código.
    if (isInResetCooldown(normalized)) {
      router.push(`/reset-password?email=${encodeURIComponent(normalized)}`);
      return;
    }

    void run(async () => {
      try {
        // Responde 200 sempre, exista ou não conta com esse e-mail.
        await forgotPassword(normalized);
        markResetCodeRequested(normalized);
        router.push(`/reset-password?email=${encodeURIComponent(normalized)}`);
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <AuthShell backHref="/login">
      <AuthIcon>
        <KeyIcon />
      </AuthIcon>

      <h1 className="mb-1 text-2xl font-extrabold text-ink-900">Esqueceu sua senha?</h1>
      <p className="mb-6 text-sm text-ink-400">
        Informe seu e-mail e enviaremos um código de 6 dígitos para você criar uma nova senha
      </p>

      {formError && <Banner type="error" message={formError} />}

      <form onSubmit={handleSubmit}>
        <Field
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
          placeholder="voce@email.com"
          autoComplete="email"
          autoFocus
          disabled={loading}
        />

        <PrimaryButton label="Enviar código" type="submit" loading={loading} className="mt-2" />
      </form>
    </AuthShell>
  );
}

function KeyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="15" r="4" />
      <path d="M10.5 12.5L20 3M20 3h-4M20 3v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
