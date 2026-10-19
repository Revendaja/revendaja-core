'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { Banner } from '@/components/auth/Banner';
import { Field, PasswordField } from '@/components/auth/Field';
import { PrimaryButton } from '@/components/auth/Button';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useAuth } from '@/lib/auth/AuthContext';
import { getErrorMessage } from '@/lib/api/errors';
import { useSubmitting } from '@/hooks/useSubmitting';
import { isValidEmail, isValidPassword, normalizeEmail } from '@/lib/utils/validation';

type FieldErrors = { email?: string; password?: string };

export default function LoginPage() {
  const { login, status, notice, clearNotice } = useAuth();
  const { loading, run } = useSubmitting();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Já logou (e-mail/senha ou Google) mas o layout pai ainda não trocou de tela: mantém o
  // formulário "ocupado" em vez de voltar ao normal por um instante antes de navegar.
  const transitioning = status === 'signedIn';

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidEmail(email)) next.email = 'Informe um e-mail válido.';
    if (!isValidPassword(password)) next.password = 'A senha deve ter entre 6 e 72 caracteres.';
    return next;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    void run(async () => {
      clearNotice();
      try {
        await login({ email: normalizeEmail(email), password });
      } catch (error) {
        // 401 aqui é "E-mail ou senha inválidos.": erro de formulário, não sessão expirada.
        setFormError(getErrorMessage(error));
      }
    });
  }

  const busy = loading || transitioning;

  return (
    <AuthShell transitioning={transitioning}>
      <h1 className="mb-1 text-2xl font-extrabold text-ink-900">Entrar com e-mail</h1>
      <p className="mb-6 text-sm text-ink-400">Use seus dados para acessar sua conta</p>

      {notice && <Banner type={notice.type} message={notice.message} />}
      {formError && <Banner type="error" message={formError} />}

      <form onSubmit={handleSubmit}>
        <Field
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          placeholder="voce@email.com"
          autoComplete="email"
          autoFocus
          disabled={busy}
        />

        <PasswordField
          label="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          placeholder="Sua senha"
          autoComplete="current-password"
          disabled={busy}
        />

        <div className="-mt-2 mb-6 flex justify-end">
          <Link href="/forgot-password" className="text-xs font-bold text-primary-500 hover:text-primary-600">
            Esqueceu sua senha?
          </Link>
        </div>

        <PrimaryButton label="Entrar" type="submit" loading={busy} />
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-ink-100" />
        <span className="text-xs text-ink-400">ou continue com</span>
        <div className="h-px flex-1 bg-ink-100" />
      </div>

      <GoogleSignInButton onError={setFormError} />

      <p className="mt-6 text-center text-sm text-ink-400">
        Ainda não tem conta?{' '}
        <Link href="/register" className="font-extrabold text-primary-500 hover:text-primary-600">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}
