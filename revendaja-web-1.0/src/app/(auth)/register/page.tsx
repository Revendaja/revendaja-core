'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { Banner } from '@/components/auth/Banner';
import { Field, PasswordField } from '@/components/auth/Field';
import { PrimaryButton } from '@/components/auth/Button';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useAuth } from '@/lib/auth/AuthContext';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import { useSubmitting } from '@/hooks/useSubmitting';
import {
  isValidEmail,
  isValidName,
  isValidPassword,
  isValidWhatsapp,
  maskWhatsapp,
  normalizeEmail,
  toApiWhatsapp,
} from '@/lib/utils/validation';

type RegisterField = 'name' | 'whatsapp' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<RegisterField, string>>;

const TOTAL_STEPS = 3;

const STEP_COPY: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Criar conta', subtitle: 'Vamos começar pelo seu nome' },
  2: { title: 'Seus contatos', subtitle: 'É assim que avisamos sobre pedidos e novidades' },
  3: { title: 'Crie uma senha', subtitle: 'Só mais um passo para começar a vender' },
};

export default function RegisterPage() {
  const { register, status } = useAuth();
  const { loading, run } = useSubmitting();
  // Já cadastrou (e-mail/senha ou Google) mas o layout pai ainda não trocou de tela: mantém o
  // formulário "ocupado" em vez de voltar ao normal por um instante antes de navegar.
  const transitioning = status === 'signedIn';
  const busy = loading || transitioning;
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function validateStep1(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidName(name)) next.name = 'Informe seu nome (mínimo 2 caracteres).';
    return next;
  }

  function validateStep2(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidWhatsapp(whatsapp)) next.whatsapp = 'Informe um WhatsApp válido com DDD.';
    if (!isValidEmail(email)) next.email = 'Informe um e-mail válido.';
    return next;
  }

  function validateStep3(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidPassword(password)) next.password = 'A senha deve ter entre 6 e 72 caracteres.';
    else if (password !== confirmPassword) next.confirmPassword = 'As senhas não coincidem.';
    return next;
  }

  function goToStep(next: number) {
    setErrors({});
    setFormError(null);
    setStep(next);
  }

  function handleNext(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = step === 1 ? validateStep1() : validateStep2();
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;
    goToStep(step + 1);
  }

  function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateStep3();
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    void run(async () => {
      try {
        await register({
          name: name.trim(),
          email: normalizeEmail(email),
          whatsapp: toApiWhatsapp(whatsapp),
          password,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        if (isApiError(error) && error.status === 409) {
          // "Já existe uma conta com este e-mail." / "...com este WhatsApp." — o campo em questão
          // fica no passo 2, não no atual (3): volta pra lá pra mostrar o erro onde ele faz sentido.
          const field: RegisterField | null = /whatsapp/i.test(message) ? 'whatsapp' : /e-?mail/i.test(message) ? 'email' : null;
          if (field) {
            setErrors({ [field]: message });
            setStep(2);
            return;
          }
        }
        setFormError(message);
      }
    });
  }

  const copy = STEP_COPY[step];

  return (
    <AuthShell backHref={step === 1 ? '/login' : undefined} transitioning={transitioning}>
      <div className="mb-5 flex gap-1.5">
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full ${index < step ? 'bg-primary-500' : 'bg-ink-100'}`}
          />
        ))}
      </div>
      <p className="mb-1 text-xs font-bold text-primary-500">
        Passo {step} de {TOTAL_STEPS}
      </p>
      <h1 className="mb-1 text-2xl font-extrabold text-ink-900">{copy.title}</h1>
      <p className="mb-6 text-sm text-ink-400">{copy.subtitle}</p>

      {formError && <Banner type="error" message={formError} />}

      {step === 1 && (
        <form onSubmit={handleNext}>
          <Field
            label="Nome completo"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            placeholder="Seu nome"
            autoComplete="name"
            autoFocus
            maxLength={120}
          />

          <PrimaryButton label="Continuar" type="submit" className="mt-2 mb-5" />

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink-100" />
            <span className="text-xs text-ink-400">ou continue com</span>
            <div className="h-px flex-1 bg-ink-100" />
          </div>

          <GoogleSignInButton onError={setFormError} />

          <p className="mt-6 text-center text-sm text-ink-400">
            Já tem conta?{' '}
            <Link href="/login" className="font-extrabold text-primary-500 hover:text-primary-600">
              Entrar
            </Link>
          </p>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleNext}>
          <Field
            label="WhatsApp"
            prefix="+55"
            value={whatsapp}
            onChange={(event) => setWhatsapp((previous) => maskWhatsapp(event.target.value, previous))}
            error={errors.whatsapp}
            placeholder="(11) 98221-4432"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
          />

          <Field
            label="E-mail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            placeholder="voce@email.com"
            autoComplete="email"
          />

          <PrimaryButton label="Continuar" type="submit" className="mt-2" />
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleRegister}>
          <PasswordField
            label="Senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            placeholder="Crie uma senha"
            autoComplete="new-password"
            autoFocus
            disabled={busy}
          />

          <PasswordField
            label="Confirmar senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={errors.confirmPassword}
            placeholder="Repita a senha"
            autoComplete="new-password"
            disabled={busy}
          />

          <PrimaryButton label="Criar conta" type="submit" loading={busy} className="mt-2" />
        </form>
      )}
    </AuthShell>
  );
}
