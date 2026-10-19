'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { updateProfile } from '@/lib/api/auth';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import { formatWhatsapp } from '@/lib/utils/format';
import { isValidName, isValidWhatsapp, maskWhatsapp, toApiWhatsapp } from '@/lib/utils/validation';
import { useSubmitting } from '@/hooks/useSubmitting';
import { Banner, Field, PageHeader, SubmitButton, TextInput } from '@/components/products/FormParts';
import { Card } from '@/components/dashboard/overview/ui';
import type { AuthUser } from '@/lib/api/types';

const NAME_MIN = 2;
const NAME_MAX = 120;

// Número salvo (com DDI) -> máscara de digitação "(11) 98221-4432".
function toMasked(stored: string | null) {
  if (!stored) return '';
  return maskWhatsapp(formatWhatsapp(stored));
}

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;
  // `key` recria o formulário se o usuário mudar por fora.
  return <AccountForm key={user.id} user={user} />;
}

function AccountForm({ user }: { user: AuthUser }) {
  const router = useRouter();
  const { store, applyUser } = useAuth();
  const { loading, run } = useSubmitting();

  const [name, setName] = useState(user.name);
  const [whatsapp, setWhatsapp] = useState(toMasked(user.whatsapp));
  const [nameError, setNameError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const nameOk = isValidName(trimmedName, NAME_MIN, NAME_MAX);
    const whatsappOk = isValidWhatsapp(whatsapp);
    setNameError(!nameOk ? `Informe seu nome (entre ${NAME_MIN} e ${NAME_MAX} caracteres).` : null);
    setWhatsappError(!whatsappOk ? 'Informe um WhatsApp válido, com DDD.' : null);
    if (!nameOk || !whatsappOk) return;

    const changes: { name?: string; whatsapp?: string } = {};
    if (trimmedName !== user.name) changes.name = trimmedName;
    const apiWhatsapp = toApiWhatsapp(whatsapp);
    if (apiWhatsapp !== user.whatsapp) changes.whatsapp = apiWhatsapp;

    if (Object.keys(changes).length === 0) {
      router.push('/dashboard');
      return;
    }

    void run(async () => {
      try {
        const updated = await updateProfile(changes);
        applyUser(updated);
        router.push('/dashboard');
      } catch (error) {
        if (isApiError(error) && error.code === 'CONFLICT') {
          setWhatsappError('Já existe uma conta com este WhatsApp.');
          return;
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <div className="w-full pb-16">
      <PageHeader title="Minha conta" subtitle="Seus dados de acesso e contato" backHref="/dashboard" />

      <div className="grid gap-4 lg:grid-cols-5">
        <form onSubmit={handleSubmit} noValidate className="lg:col-span-3">
          <Card>
            {formError && <Banner type="error" message={formError} />}

            <div className="flex flex-col gap-4">
              <Field label="Seu nome" error={nameError}>
                <TextInput
                  value={name}
                  onChange={(value) => {
                    setName(value);
                    if (nameError) setNameError(null);
                  }}
                  error={nameError}
                  placeholder="Ex: Juliana Souza"
                  maxLength={NAME_MAX}
                  disabled={loading}
                  aria-label="Seu nome"
                />
              </Field>

              <Field
                label="E-mail"
                hint="O e-mail não pode ser alterado por aqui. Fale com o suporte se precisar trocar."
              >
                <input
                  value={user.email}
                  readOnly
                  disabled
                  aria-label="E-mail"
                  className="h-11 w-full rounded-xl border border-ink-200 bg-ink-50 px-3 text-sm text-ink-500"
                />
              </Field>

              <Field label="WhatsApp" error={whatsappError}>
                <TextInput
                  value={whatsapp}
                  onChange={(value) => {
                    setWhatsapp(maskWhatsapp(value, whatsapp));
                    if (whatsappError) setWhatsappError(null);
                  }}
                  error={whatsappError}
                  placeholder="(11) 98221-4432"
                  inputMode="tel"
                  disabled={loading}
                  aria-label="WhatsApp"
                />
              </Field>

              <SubmitButton loading={loading}>Salvar alterações</SubmitButton>
            </div>
          </Card>
        </form>

        <aside className="lg:col-span-2">
          <Card className="flex flex-col items-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-500 text-3xl font-bold text-white">
              {name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <p className="mt-3 text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="text-xs text-ink-400">{user.email}</p>
            {store && (
              <p className="mt-3 text-xs text-ink-400">
                Loja criada em {new Date(store.createdAt).toLocaleDateString('pt-BR')}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
