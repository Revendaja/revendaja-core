'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStoreSettings, updateStore, updateStoreSettings, type StoreChanges } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import type { NewSalePaymentMethod, StoreInfo, StoreSettings } from '@/lib/api/types';
import { PAYMENT_CHIPS, PAYMENT_ICON } from '@/lib/utils/sales';
import { useSubmitting } from '@/hooks/useSubmitting';
import { Icon } from '@/components/dashboard/icons';
import { Banner, Field, PageHeader, TextInput, Toggle } from '@/components/products/FormParts';
import { Card, CardHeader } from '@/components/dashboard/overview/ui';
import { storeUrl } from '@/lib/storefront/domain';

// Mesmas regras da API: não há campo de link separado — o handle é sempre o nome da loja
// "traduzido" (sem espaço, acento ou maiúscula), igual à criação da loja.
const NAME_MIN = 2;
const NAME_MAX = 120;
const HANDLE_MIN = 3;
const HANDLE_MAX = 63;
const BIO_MAX = 280;

const NAME_ERROR = `Informe o nome da sua loja (entre ${NAME_MIN} e ${NAME_MAX} caracteres).`;
const NAME_TOO_SHORT_FOR_LINK = 'Esse nome gera um link muito curto. Adicione mais letras ou números.';

function slugifyName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, HANDLE_MAX);
}

export default function EditStorePage() {
  const { store } = useAuth();
  if (!store) return null;
  // `key` recria o formulário se a loja mudar por fora (ex.: o liga/desliga de Minha loja).
  return <EditStoreForm key={store.id} store={store} />;
}

function EditStoreForm({ store }: { store: StoreInfo }) {
  const router = useRouter();
  const { applyStore } = useAuth();
  const { loading, run } = useSubmitting();

  const [storeName, setStoreName] = useState(store.storeName);
  const [bio, setBio] = useState(store.bio ?? '');
  const [defaultMinStock, setDefaultMinStock] = useState(String(store.defaultMinStock));
  const [nameError, setNameError] = useState<string | null>(null);
  const [minStockError, setMinStockError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ".revendaja.com": vem do link que a API devolveu, para não ficar fixo na tela.
  const domainSuffix = storeUrl(store.handle).replace(/^https?:\/\/[^.]+/, '');
  // O link da vitrine acompanha o nome em tempo real.
  const handle = slugifyName(storeName);

  // Valida como a API e devolve só o que mudou (null = há erro na tela).
  function buildChanges(): StoreChanges | null {
    const name = storeName.trim();
    const nameOk = name.length >= NAME_MIN && name.length <= NAME_MAX;
    const linkOk = handle.length >= HANDLE_MIN;
    const minStockValue = Number(defaultMinStock);
    const minStockOk = defaultMinStock.trim() !== '' && Number.isInteger(minStockValue) && minStockValue >= 0;
    setNameError(!nameOk ? NAME_ERROR : !linkOk ? NAME_TOO_SHORT_FOR_LINK : null);
    setMinStockError(!minStockOk ? 'Informe um número válido (0 ou mais).' : null);
    if (!nameOk || !linkOk || !minStockOk) return null;

    const changes: StoreChanges = {};
    if (name !== store.storeName) changes.storeName = name;
    // Só manda handle novo se o NOME mudou de fato: compara com o slug do nome ATUAL salvo, não com
    // `store.handle` puro (que pode ter sufixo de desempate, como "leal-2", e nunca bate 1:1).
    if (handle !== slugifyName(store.storeName)) changes.handle = handle;
    // Descrição vazia limpa a que existia.
    if (bio.trim() !== (store.bio ?? '')) changes.bio = bio.trim();
    if (minStockValue !== store.defaultMinStock) changes.defaultMinStock = minStockValue;
    return changes;
  }

  function save(changes: StoreChanges) {
    void run(async () => {
      try {
        const updated = await updateStore(changes);
        // Mantém a sessão (e as telas Minha loja e Painel) em sincronia com o que o servidor gravou.
        applyStore(updated);
        router.push('/loja');
      } catch (error) {
        if (isApiError(error) && error.code === 'HANDLE_UNAVAILABLE') {
          setNameError('Já existe uma loja com um nome parecido. Tente outro nome.');
          return;
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const changes = buildChanges();
    if (!changes) return;

    // Nada mudou: não há o que salvar.
    if (Object.keys(changes).length === 0) {
      router.push('/loja');
      return;
    }

    // Trocar o nome troca o link da vitrine junto: derruba o endereço antigo. Confirma antes.
    if (changes.handle) {
      const ok = window.confirm(
        `Trocar o link da vitrine?\n\nO endereço atual (${store.handle}${domainSuffix}) deixa de funcionar. Quem tiver o link antigo não vai encontrar a sua loja.`,
      );
      if (!ok) return;
    }

    save(changes);
  }

  return (
    <div className="w-full pb-16">
      <PageHeader title="Editar loja" subtitle="Nome, link e descrição da sua vitrine" backHref="/loja" />

      <div className="grid gap-4 lg:grid-cols-5">
        <form onSubmit={handleSubmit} noValidate className="lg:col-span-3">
          <Card>
            {formError && <Banner type="error" message={formError} />}

            <div className="flex flex-col gap-4">
              <Field label="Nome da loja" error={nameError}>
                <TextInput
                  value={storeName}
                  onChange={(value) => {
                    setStoreName(value);
                    if (nameError) setNameError(null);
                  }}
                  error={nameError}
                  placeholder="Ex: Juliana Beauty"
                  maxLength={NAME_MAX}
                  disabled={loading}
                  aria-label="Nome da loja"
                />
              </Field>

              <Field label="Link da vitrine" hint="O link é sempre o nome da sua loja — muda junto com ele.">
                <div className="flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 text-sm text-ink-700">
                  <Icon name="globe" size={15} className="text-ink-400" />
                  <span className="min-w-0 flex-1 truncate">
                    {handle || 'sualoja'}
                    {domainSuffix}
                  </span>
                </div>
              </Field>

              <Field label="Descrição da loja (opcional)" hint="Aparece no topo da sua vitrine virtual.">
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Uma frase curta sobre o que você vende..."
                  maxLength={BIO_MAX}
                  rows={3}
                  disabled={loading}
                  aria-label="Descrição da loja"
                  className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-500 disabled:opacity-60"
                />
                <p className="mt-1 text-right text-xs text-ink-400">
                  {bio.length}/{BIO_MAX}
                </p>
              </Field>

              <Field
                label="Estoque mínimo padrão"
                error={minStockError}
                hint="Todo produto novo já nasce com esse mínimo e você recebe o alerta de estoque baixo sem configurar produto por produto. Também atualiza quem já está cadastrado e ainda não tem um mínimo próprio. 0 = desligado."
              >
                <TextInput
                  value={defaultMinStock}
                  onChange={(value) => {
                    setDefaultMinStock(value.replace(/\D/g, ''));
                    if (minStockError) setMinStockError(null);
                  }}
                  error={minStockError}
                  inputMode="numeric"
                  placeholder="0"
                  disabled={loading}
                  aria-label="Estoque mínimo padrão"
                />
              </Field>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="h-11 flex-1 rounded-xl bg-primary-500 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Salvando...' : 'Salvar alterações'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/loja')}
                disabled={loading}
                className="h-11 rounded-xl border border-ink-200 px-5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </Card>
        </form>

        <div className="lg:col-span-2">
          <StorefrontSettingsCard />
        </div>
      </div>
    </div>
  );
}

// Salva na hora, a cada toque (sem botão): formas de pagamento aceitas e esconder produto sem estoque.
function StorefrontSettingsCard() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: queryKeys.storeSettings(), queryFn: getStoreSettings });
  const settings = settingsQuery.data;

  const mutation = useMutation({
    mutationFn: updateStoreSettings,
    onSuccess: (updated) => queryClient.setQueryData<StoreSettings>(queryKeys.storeSettings(), updated),
  });

  function togglePayment(method: NewSalePaymentMethod) {
    if (!settings) return;
    const has = settings.acceptedPaymentMethods.includes(method);
    // A API exige ao menos uma forma de pagamento: o último chip ligado não desliga.
    if (has && settings.acceptedPaymentMethods.length === 1) return;
    const next = PAYMENT_CHIPS.map((chip) => chip.method).filter((m) =>
      m === method ? !has : settings.acceptedPaymentMethods.includes(m),
    );
    mutation.mutate({ acceptedPaymentMethods: next });
  }

  return (
    <Card>
      <CardHeader title="Vitrine" />
      <p className="mt-0.5 text-[11px] text-ink-400">Alterações aqui são salvas na hora.</p>

      {settingsQuery.isPending && <div className="mt-4 h-40 animate-pulse rounded-xl bg-ink-50" />}

      {settingsQuery.isError && (
        <div className="py-6 text-center">
          <p className="mb-3 text-xs font-medium text-danger">{getErrorMessage(settingsQuery.error)}</p>
          <button
            type="button"
            onClick={() => void settingsQuery.refetch()}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {settings && (
        <div className="mt-4 flex flex-col gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold text-ink-600">Formas de pagamento aceitas</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_CHIPS.map(({ method, label }) => {
                const active = settings.acceptedPaymentMethods.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => togglePayment(method)}
                    disabled={mutation.isPending}
                    aria-pressed={active}
                    className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition disabled:opacity-60 ${
                      active ? 'bg-primary-500 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                    }`}
                  >
                    <Icon name={PAYMENT_ICON[method]} size={15} />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">Pelo menos uma precisa ficar ligada.</p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-ink-900">Esconder produtos sem estoque</p>
              <p className="mt-0.5 text-[11px] text-ink-400">O que zerar o estoque some da vitrine.</p>
            </div>
            <Toggle
              checked={settings.hideOutOfStock}
              onChange={(value) => mutation.mutate({ hideOutOfStock: value })}
              disabled={mutation.isPending}
              label="Esconder produtos sem estoque"
            />
          </div>

          {mutation.isError && (
            <p className="text-xs font-medium text-danger" role="alert">
              {getErrorMessage(mutation.error)}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
