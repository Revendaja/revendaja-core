'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { forgotPassword, resetPassword } from '@/lib/api/auth';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import { markResetCodeRequested, RESET_RESEND_COOLDOWN_SECONDS, getResetCodeRequestedAt } from '@/lib/auth/passwordReset';
import { formatCountdown, useCooldown } from '@/hooks/useCooldown';
import { useSubmitting } from '@/hooks/useSubmitting';
import { isValidPassword } from '@/lib/utils/validation';
import { CodeInput, CODE_LENGTH } from '@/components/auth/CodeInput';
import { Banner, Field, PageHeader, SubmitButton } from '@/components/products/FormParts';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';

// O código aceita no máximo 5 tentativas; depois disso nem o código certo funciona.
const MAX_CODE_ATTEMPTS = 5;

const PASSWORD_INPUT =
  'h-11 w-full rounded-xl border bg-white px-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 disabled:opacity-60';

export default function SecurityPage() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  return (
    <div className="w-full pb-16">
      <PageHeader title="Segurança" subtitle="Senha e acesso à sua conta" backHref="/dashboard" />

      <div className="flex flex-col gap-4">
        <PasswordCard email={user.email} />

        <Card>
          <CardHeader title="Sessão" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-xs text-ink-400">
              Encerra o seu acesso neste navegador. Para entrar de novo, será preciso informar e-mail e senha.
            </p>
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => {
                setLoggingOut(true);
                void logout();
              }}
              className="h-10 rounded-xl border border-danger px-4 text-xs font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60"
            >
              {loggingOut ? 'Saindo...' : 'Sair da conta'}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Não há "senha atual + nova senha" na API: a troca segue o fluxo de redefinição, com um código
// enviado ao e-mail da conta (prova de que quem troca é o dono). Ao concluir, a API encerra todas as
// sessões, então volta para o login.
function PasswordCard({ email }: { email: string }) {
  const router = useRouter();
  const { returnToLogin } = useAuth();
  const sending = useSubmitting();
  const submitting = useSubmitting();

  const [requestedAt, setRequestedAt] = useState<number | null>(() => getResetCodeRequestedAt(email));
  const [codeSent, setCodeSent] = useState(requestedAt !== null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ code?: string; password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const cooldown = useCooldown(requestedAt, RESET_RESEND_COOLDOWN_SECONDS);
  const attemptsExhausted = failedAttempts >= MAX_CODE_ATTEMPTS;

  function handleSendCode() {
    if (cooldown > 0) return;
    void sending.run(async () => {
      setFormError(null);
      setInfo(null);
      try {
        await forgotPassword(email);
        markResetCodeRequested(email);
        setRequestedAt(Date.now());
        setCodeSent(true);
        // Cada pedido novo invalida o código anterior e zera as tentativas.
        setCode('');
        setErrors({});
        setFailedAttempts(0);
        setInfo(`Enviamos um código de ${CODE_LENGTH} dígitos para ${email}. Ele vale por 15 minutos.`);
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (attemptsExhausted) return;
    setFormError(null);
    setInfo(null);

    const next: typeof errors = {};
    if (code.length !== CODE_LENGTH) next.code = `Informe o código de ${CODE_LENGTH} dígitos enviado para o seu e-mail.`;
    if (!isValidPassword(password)) next.password = 'A senha deve ter entre 6 e 72 caracteres.';
    else if (password !== confirmPassword) next.confirmPassword = 'As senhas não coincidem.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    void submitting.run(async () => {
      try {
        await resetPassword({ email, code, password });
      } catch (error) {
        if (isApiError(error) && error.code === 'PASSWORD_RESET_CODE_INVALID') {
          const attempts = failedAttempts + 1;
          setFailedAttempts(attempts);
          setCode('');
          setFormError(
            attempts >= MAX_CODE_ATTEMPTS
              ? 'Você atingiu o limite de tentativas. Peça um novo código para continuar.'
              : error.message,
          );
        } else {
          setFormError(getErrorMessage(error));
        }
        return;
      }
      await returnToLogin({ type: 'success', message: 'Senha alterada! Entre com a sua nova senha.' });
      router.push('/login');
    });
  }

  return (
    <Card>
      <CardHeader title="Senha" />
      <p className="mt-1 text-xs text-ink-400">
        Para trocar a senha, enviamos um código de confirmação para <strong className="text-ink-700">{email}</strong>.
        Ao concluir, você será desconectado de todos os dispositivos.
      </p>

      <div className="mt-4">
        {formError && <Banner type="error" message={formError} />}
        {info && <Banner type="info" message={info} />}
      </div>

      {!codeSent ? (
        <button
          type="button"
          onClick={handleSendCode}
          disabled={sending.loading}
          className="h-11 rounded-xl bg-primary-500 px-5 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:opacity-60"
        >
          {sending.loading ? 'Enviando...' : 'Enviar código por e-mail'}
        </button>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex max-w-md flex-col gap-4">
          <CodeInput
            label="Código recebido por e-mail"
            value={code}
            onChangeText={(digits) => {
              setCode(digits);
              if (errors.code) setErrors((previous) => ({ ...previous, code: undefined }));
            }}
            error={errors.code}
            disabled={submitting.loading || attemptsExhausted}
          />

          <Field label="Nova senha" error={errors.password}>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Crie uma nova senha"
              autoComplete="new-password"
              maxLength={72}
              disabled={submitting.loading}
              aria-label="Nova senha"
              className={`${PASSWORD_INPUT} ${errors.password ? 'border-danger' : 'border-ink-200 focus:border-primary-500'}`}
            />
          </Field>

          <Field label="Confirmar nova senha" error={errors.confirmPassword}>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
              maxLength={72}
              disabled={submitting.loading}
              aria-label="Confirmar nova senha"
              className={`${PASSWORD_INPUT} ${errors.confirmPassword ? 'border-danger' : 'border-ink-200 focus:border-primary-500'}`}
            />
          </Field>

          <SubmitButton loading={submitting.loading} disabled={attemptsExhausted || sending.loading}>
            Alterar senha
          </SubmitButton>

          <button
            type="button"
            onClick={handleSendCode}
            disabled={cooldown > 0 || sending.loading || submitting.loading}
            className="self-start text-xs font-semibold text-primary-600 hover:underline disabled:cursor-not-allowed disabled:text-ink-400 disabled:no-underline"
          >
            {sending.loading
              ? 'Enviando...'
              : cooldown > 0
                ? `Reenviar código em ${formatCountdown(cooldown)}`
                : 'Reenviar código'}
          </button>
        </form>
      )}
    </Card>
  );
}
