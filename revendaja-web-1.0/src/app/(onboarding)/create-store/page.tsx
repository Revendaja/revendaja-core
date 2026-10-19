'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell, AuthIcon } from '@/components/auth/AuthShell';
import { Banner } from '@/components/auth/Banner';
import { Field } from '@/components/auth/Field';
import { PrimaryButton } from '@/components/auth/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { createStore } from '@/lib/api/stores';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import type { StoreInfo } from '@/lib/api/types';
import { useSubmitting } from '@/hooks/useSubmitting';
import { isValidName } from '@/lib/utils/validation';
import { storeUrl } from '@/lib/storefront/domain';

export default function CreateStorePage() {
  const { user, isVerified, store, applyStore, markUnverified, refreshMe, logout } = useAuth();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const { loading, run } = useSubmitting();
  const [storeName, setStoreName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Loja recém-criada: mostramos o link antes de entrar no painel.
  const [created, setCreated] = useState<StoreInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnterDashboard() {
    if (!created) return;
    // Aplica a loja e navega dentro da transição: o botão continua "carregando" até o painel
    // abrir de verdade, em vez de voltar ao normal por um instante antes de sair da página.
    startNavigation(() => {
      applyStore(created);
      router.push('/dashboard');
    });
  }

  useEffect(() => {
    if (!user?.whatsapp) router.replace('/complete-profile');
    else if (!isVerified) router.replace('/verify-otp');
    else if (store && !created) router.replace('/dashboard');
  }, [user, isVerified, store, created, router]);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!isValidName(storeName)) {
      setNameError('Informe o nome da sua loja (entre 2 e 120 caracteres).');
      return;
    }
    setNameError(null);

    void run(async () => {
      try {
        setCreated(await createStore(storeName.trim()));
      } catch (error) {
        if (isApiError(error) && error.status === 403) {
          // "Confirme seu e-mail antes de criar a loja." → volta para a tela do código.
          markUnverified();
          return;
        }
        if (isApiError(error) && error.status === 409) {
          // "Você já possui uma loja." → busca o estado real em /me e segue para o painel.
          try {
            await refreshMe();
            return;
          } catch (meError) {
            setFormError(getErrorMessage(meError));
            return;
          }
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  async function handleCopy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFormError('Não foi possível copiar o link.');
    }
  }

  if (created) {
    return (
      <AuthShell>
        <AuthIcon>
          <CheckIcon />
        </AuthIcon>

        <h1 className="mb-1 text-2xl font-extrabold text-ink-900">Sua loja está no ar!</h1>
        <p className="mb-6 text-sm text-ink-400">
          <span className="font-bold text-ink-700">{created.storeName}</span> já tem uma vitrine. Compartilhe o link
          com seus clientes.
        </p>

        {formError && <Banner type="error" message={formError} />}

        <p className="mb-1.5 text-xs font-bold text-ink-500">Link da sua loja</p>
        <div className="mb-4 flex h-14 items-center rounded-2xl bg-ink-50 px-4">
          <span className="flex-1 truncate text-sm font-bold text-primary-600">
            {storeUrl(created.handle).replace(/^https?:\/\//, '')}
          </span>
        </div>

        <div className="mb-6 flex gap-3">
          <button
            type="button"
            onClick={() => void handleCopy(storeUrl(created.handle))}
            disabled={navigating}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-ink-50 text-sm font-bold text-primary-600 hover:bg-ink-100 disabled:opacity-60"
          >
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>

        <PrimaryButton label="Ir para o painel" onClick={handleEnterDashboard} loading={navigating} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthIcon>
        <StoreIcon />
      </AuthIcon>

      <h1 className="mb-1 text-2xl font-extrabold text-ink-900">Crie sua loja</h1>
      <p className="mb-6 text-sm text-ink-400">É só o nome — a gente cria o link da sua vitrine pra você</p>

      {formError && <Banner type="error" message={formError} />}

      <form onSubmit={handleCreate}>
        <Field
          label="Nome da loja"
          value={storeName}
          onChange={(event) => setStoreName(event.target.value)}
          error={nameError}
          placeholder="Ex: Leal Perfumaria"
          autoFocus
          maxLength={120}
          disabled={loading}
        />

        <PrimaryButton label="Criar loja" type="submit" loading={loading} className="mt-2 mb-6" />
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

function StoreIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l1.5-5h15L21 9M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
