'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell, AuthIcon } from '@/components/auth/AuthShell';
import { Banner } from '@/components/auth/Banner';
import { Field } from '@/components/auth/Field';
import { PrimaryButton } from '@/components/auth/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { updateProfile } from '@/lib/api/auth';
import { getErrorMessage } from '@/lib/api/errors';
import { postAuthPath } from '@/lib/auth/routes';
import { useSubmitting } from '@/hooks/useSubmitting';
import { isValidWhatsapp, maskWhatsapp, toApiWhatsapp } from '@/lib/utils/validation';

// Só aparece para quem entrou pela primeira vez com o Google (ver postAuthPath): o cadastro por
// e-mail/senha já pede o WhatsApp antes, então essa tela não entra no caminho dele.
export default function CompleteProfilePage() {
  const { isVerified, store, applyUser, logout } = useAuth();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const { loading, run } = useSubmitting();
  const busy = loading || navigating;
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidWhatsapp(whatsapp)) {
      setError('Informe um WhatsApp válido com DDD.');
      return;
    }
    setError(null);
    setFormError(null);

    void run(async () => {
      try {
        const user = await updateProfile({ whatsapp: toApiWhatsapp(whatsapp) });
        applyUser(user);
        // Navega dentro de uma transição: `navigating` mantém o botão "carregando" até a troca de
        // tela acontecer de verdade, em vez de voltar ao normal por um instante antes de sair da página.
        startNavigation(() => router.replace(postAuthPath(user.whatsapp, isVerified, store)));
      } catch (err) {
        setFormError(getErrorMessage(err));
      }
    });
  }

  return (
    <AuthShell>
      <AuthIcon>
        <WhatsappIcon />
      </AuthIcon>

      <h1 className="mb-1 text-2xl font-extrabold text-ink-900">Falta só mais um passo</h1>
      <p className="mb-6 text-sm text-ink-400">É assim que avisamos sobre pedidos e novidades da sua loja</p>

      {formError && <Banner type="error" message={formError} />}

      <form onSubmit={handleSubmit}>
        <Field
          label="WhatsApp"
          prefix="+55"
          value={whatsapp}
          onChange={(event) => setWhatsapp((previous) => maskWhatsapp(event.target.value, previous))}
          error={error}
          placeholder="(11) 98221-4432"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          disabled={busy}
        />

        <PrimaryButton label="Continuar" type="submit" loading={busy} className="mt-2 mb-6" />
      </form>

      <button
        type="button"
        onClick={() => void logout()}
        className="mx-auto block text-sm font-bold text-ink-400 hover:text-ink-700"
      >
        Sair da conta
      </button>
    </AuthShell>
  );
}

function WhatsappIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.5 11.5a8.5 8.5 0 1 1-15.3-5.1L4 3l4.8 1.3a8.5 8.5 0 0 1 11.7 7.2z" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M8.5 9.5c.3 2.5 2.5 4.7 5 5 .6.1 1-.4.8-1l-.6-1.2a.6.6 0 0 0-.7-.3l-.9.3a4 4 0 0 1-2.4-2.4l.3-.9a.6.6 0 0 0-.3-.7L8.5 7.7c-.6-.2-1.1.2-1 .8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
