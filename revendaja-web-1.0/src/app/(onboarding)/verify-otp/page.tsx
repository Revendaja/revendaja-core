'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell, AuthIcon } from '@/components/auth/AuthShell';
import { Banner } from '@/components/auth/Banner';
import { CodeInput, CODE_LENGTH } from '@/components/auth/CodeInput';
import { PrimaryButton } from '@/components/auth/Button';
import { OTP_RESEND_COOLDOWN_SECONDS, useAuth } from '@/lib/auth/AuthContext';
import { postAuthPath } from '@/lib/auth/routes';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import { formatCountdown, useCooldown } from '@/hooks/useCooldown';
import { useSubmitting } from '@/hooks/useSubmitting';

// Erros 400 que exigem um novo código: o usuário precisa clicar em "Reenviar código".
const NEEDS_NEW_CODE = ['OTP_NOT_FOUND', 'OTP_EXPIRED', 'OTP_MAX_ATTEMPTS_REACHED'];

export default function VerifyOtpPage() {
  const { user, isVerified, store, otpSentAt, verifyOtp, resendOtp, setOtpCooldownRemaining, logout } = useAuth();
  const router = useRouter();
  const whatsapp = user?.whatsapp ?? null;
  const verifying = useSubmitting();
  const resending = useSubmitting();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [highlightResend, setHighlightResend] = useState(false);

  const cooldown = useCooldown(otpSentAt, OTP_RESEND_COOLDOWN_SECONDS);
  // Verificou com sucesso mas o redirect do useEffect abaixo ainda não trocou de tela: mantém a
  // tela "ocupada" em vez de voltar ao normal por um instante antes de navegar.
  const busy = verifying.loading || resending.loading || isVerified;

  useEffect(() => {
    if (isVerified) router.replace(postAuthPath(whatsapp, isVerified, store));
  }, [isVerified, whatsapp, store, router]);

  function submit(value: string) {
    if (value.length !== CODE_LENGTH) {
      setCodeError(`Informe o código de ${CODE_LENGTH} dígitos que enviamos para o seu e-mail.`);
      return;
    }

    void verifying.run(async () => {
      setCodeError(null);
      setFormError(null);
      setInfo(null);
      try {
        await verifyOtp(value);
      } catch (error) {
        if (isApiError(error) && error.status === 401) {
          // "Código inválido." (máx. 5 tentativas erradas por código).
          setCodeError(error.message);
          setCode('');
        } else if (isApiError(error) && NEEDS_NEW_CODE.includes(error.code)) {
          setFormError(error.message);
          setHighlightResend(true);
          setCode('');
        } else {
          setFormError(getErrorMessage(error));
        }
      }
    });
  }

  function handleChangeCode(digits: string) {
    setCode(digits);
    if (codeError) setCodeError(null);
    if (digits.length === CODE_LENGTH) submit(digits);
  }

  function handleResend() {
    if (cooldown > 0 || busy) return;

    void resending.run(async () => {
      setFormError(null);
      setInfo(null);
      try {
        await resendOtp();
        setCode('');
        setCodeError(null);
        setHighlightResend(false);
        setInfo('Enviamos um novo código para o seu e-mail. O código anterior deixou de valer.');
      } catch (error) {
        if (isApiError(error) && error.status === 429) {
          // "Aguarde {n}s antes de solicitar um novo código." — alinha o contador com o do servidor.
          const seconds = /(\d+)\s*s\b/.exec(error.message)?.[1];
          if (seconds) setOtpCooldownRemaining(Number(seconds));
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <AuthShell transitioning={isVerified}>
      <AuthIcon>
        <MailIcon />
      </AuthIcon>

      <h1 className="mb-1 text-2xl font-extrabold text-ink-900">Confirme seu e-mail</h1>
      <p className="mb-1 text-sm text-ink-400">
        Enviamos um código de {CODE_LENGTH} dígitos para o seu e-mail{' '}
        <span className="font-bold text-ink-700">{user?.email}</span>
      </p>
      <p className="mb-6 text-xs text-ink-400">Não chegou? Olhe também a caixa de spam.</p>

      {formError && <Banner type="error" message={formError} />}
      {info && <Banner type="success" message={info} />}

      <CodeInput label="Código de verificação" value={code} onChangeText={handleChangeCode} error={codeError} autoFocus disabled={busy} />

      <PrimaryButton label="Confirmar" onClick={() => submit(code)} loading={verifying.loading || isVerified} disabled={busy} className="mb-5" />

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown > 0 || busy}
        className={`mx-auto flex h-12 items-center justify-center rounded-2xl px-4 text-sm font-bold disabled:cursor-not-allowed ${
          cooldown > 0 ? 'text-ink-400' : 'text-primary-500'
        } ${highlightResend ? 'border border-primary-500 bg-primary-50' : ''}`}
      >
        {resending.loading ? 'Enviando...' : cooldown > 0 ? `Reenviar código em ${formatCountdown(cooldown)}` : 'Reenviar código'}
      </button>

      <button
        type="button"
        onClick={() => void logout()}
        className="mx-auto mt-6 block text-sm font-bold text-ink-400 hover:text-ink-700"
      >
        Sair da conta
      </button>
    </AuthShell>
  );
}

function MailIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
