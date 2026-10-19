'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell, AuthIcon } from '@/components/auth/AuthShell';
import { Banner } from '@/components/auth/Banner';
import { Field, PasswordField } from '@/components/auth/Field';
import { CodeInput, CODE_LENGTH } from '@/components/auth/CodeInput';
import { PrimaryButton } from '@/components/auth/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { forgotPassword, resetPassword } from '@/lib/api/auth';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import {
  getResetCodeRequestedAt,
  markResetCodeRequested,
  RESET_RESEND_COOLDOWN_SECONDS,
} from '@/lib/auth/passwordReset';
import { formatCountdown, useCooldown } from '@/hooks/useCooldown';
import { useSubmitting } from '@/hooks/useSubmitting';
import { isValidPassword } from '@/lib/utils/validation';

// O código aceita no máximo 5 tentativas; depois disso nem o código certo funciona.
const MAX_CODE_ATTEMPTS = 5;

type FieldErrors = { code?: string; password?: string; confirmPassword?: string };

export function ResetPasswordForm() {
  const email = useSearchParams().get('email') ?? '';
  const router = useRouter();
  const { returnToLogin } = useAuth();
  const submitting = useSubmitting();
  const resending = useSubmitting();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [highlightResend, setHighlightResend] = useState(false);
  const [requestedAt, setRequestedAt] = useState<number | null>(() => (email ? getResetCodeRequestedAt(email) : null));

  const cooldown = useCooldown(requestedAt, RESET_RESEND_COOLDOWN_SECONDS);
  const busy = submitting.loading || resending.loading;
  const attemptsExhausted = failedAttempts >= MAX_CODE_ATTEMPTS;

  if (!email) {
    return (
      <AuthShell backHref="/forgot-password">
        <Banner type="error" message="Informe seu e-mail primeiro para receber o código." />
      </AuthShell>
    );
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (code.length !== CODE_LENGTH) next.code = `Informe o código de ${CODE_LENGTH} dígitos enviado para o seu e-mail.`;
    if (!isValidPassword(password)) next.password = 'A senha deve ter entre 6 e 72 caracteres.';
    else if (password !== confirmPassword) next.confirmPassword = 'As senhas não coincidem.';
    return next;
  }

  function handleReset(event: React.FormEvent) {
    event.preventDefault();
    if (attemptsExhausted) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(null);
    setInfo(null);
    if (Object.keys(nextErrors).length > 0) return;

    void submitting.run(async () => {
      try {
        await resetPassword({ email, code, password });
      } catch (error) {
        if (isApiError(error) && error.code === 'PASSWORD_RESET_CODE_INVALID') {
          // Única resposta para qualquer falha (errado, expirado, já usado, tentativas esgotadas): pede novo código.
          const attempts = failedAttempts + 1;
          setFailedAttempts(attempts);
          setHighlightResend(true);
          setCode('');
          setFormError(
            attempts >= MAX_CODE_ATTEMPTS
              ? 'Você atingiu o limite de tentativas. Solicite um novo código para continuar.'
              : error.message
          );
        } else {
          setFormError(getErrorMessage(error));
        }
        return;
      }

      // Sucesso: a redefinição derruba a sessão e não há login automático. Volta ao login.
      await returnToLogin({ type: 'success', message: 'Senha redefinida! Entre com a sua nova senha.' });
      router.push('/login');
    });
  }

  function handleResend() {
    if (cooldown > 0 || busy) return;

    void resending.run(async () => {
      setFormError(null);
      setInfo(null);
      try {
        await forgotPassword(email);
        markResetCodeRequested(email);
        setRequestedAt(Date.now());
        // Cada pedido novo invalida o código anterior e zera as tentativas.
        setCode('');
        setErrors({});
        setFailedAttempts(0);
        setHighlightResend(false);
        setInfo('Enviamos um novo código para o seu e-mail. O código anterior deixou de valer.');
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <AuthShell backHref="/login">
      <AuthIcon>
        <LockOpenIcon />
      </AuthIcon>

      <h1 className="mb-1 text-2xl font-extrabold text-ink-900">Redefinir senha</h1>
      <p className="mb-6 text-sm text-ink-400">
        Se existir uma conta com esse e-mail, enviamos um código de {CODE_LENGTH} dígitos. Ele vale por 15 minutos —
        olhe também a caixa de spam.
      </p>

      {formError && <Banner type="error" message={formError} />}
      {info && <Banner type="success" message={info} />}

      <form onSubmit={handleReset}>
        <Field label="E-mail" value={email} disabled />

        <CodeInput
          label="Código recebido por e-mail"
          value={code}
          onChangeText={(digits) => {
            setCode(digits);
            if (errors.code) setErrors((previous) => ({ ...previous, code: undefined }));
          }}
          error={errors.code}
          autoFocus
          disabled={submitting.loading || attemptsExhausted}
        />

        <PasswordField
          label="Nova senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          placeholder="Crie uma nova senha"
          autoComplete="new-password"
          disabled={submitting.loading}
        />

        <PasswordField
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
          placeholder="Repita a nova senha"
          autoComplete="new-password"
          disabled={submitting.loading}
        />

        <PrimaryButton
          label="Redefinir"
          type="submit"
          loading={submitting.loading}
          disabled={attemptsExhausted || resending.loading}
          className="mb-5"
        />
      </form>

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown > 0 || busy}
        className={`mx-auto flex h-12 items-center justify-center rounded-2xl px-4 text-sm font-bold disabled:cursor-not-allowed ${
          cooldown > 0 ? 'text-ink-400' : 'text-primary-500'
        } ${highlightResend ? 'border border-primary-500 bg-primary-50' : ''}`}
      >
        {resending.loading
          ? 'Enviando...'
          : cooldown > 0
            ? `Reenviar código em ${formatCountdown(cooldown)}`
            : highlightResend
              ? 'Solicitar novo código'
              : 'Reenviar código'}
      </button>
    </AuthShell>
  );
}

function LockOpenIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8-1" strokeLinecap="round" />
    </svg>
  );
}
