'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStorefrontCustomization, updateStorefrontCustomization, uploadBannerImage, type StorefrontConfigChanges } from '@/lib/api/storefrontConfig';
import { listStoreCategories } from '@/lib/api/storeCategories';
import { getErrorMessage } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queryKeys';
import { BENEFIT_ICONS, MAX_BANNERS, type BenefitIcon, type CollectionLink, type StorefrontBanner, type StorefrontConfig, type StorefrontCustomization, type StorefrontSection } from '@/lib/api/types';
import { storeUrl } from '@/lib/storefront/domain';
import { Field, PageHeader, TextInput, ToggleRow } from '@/components/products/FormParts';
import { Icon } from '@/components/dashboard/icons';
import { ImageField, MAX_IMAGE_MB, SelectInput } from '@/components/storefront/editor/fields';
import { SectionEditor, filled } from '@/components/storefront/editor/SectionEditor';

// Limites iguais aos da API (storefront.config.ts).
const LIMITS = {
  announcementText: 120,
  announcementRight: 80,
  button: 24,
  benefitTitle: 30,
  benefitText: 60,
  flashTitle: 40,
  flashSubtitle: 80,
  collectionTitle: 40,
  collectionSubtitle: 80,
} as const;

const ICON_LABELS: Record<BenefitIcon, string> = {
  truck: 'Entrega',
  card: 'Pagamento',
  shield: 'Segurança',
  chat: 'Atendimento',
  gift: 'Presente',
  star: 'Estrela',
};

// Valor do <select> para "banner sem link".
const NO_LINK = 'none';

const SECTION_LINKS: { value: string; label: string }[] = [
  { value: 'section:featured', label: 'Produtos em destaque' },
  { value: 'section:offers', label: 'Ofertas' },
  { value: 'section:new', label: 'Novidades' },
  { value: 'section:catalog', label: 'Todos os produtos' },
];

function linkToValue(link: CollectionLink) {
  if (link.type === 'section') return `section:${link.section}`;
  return `${link.type}:${link.id}`;
}

function valueToLink(value: string): CollectionLink {
  const [type, id] = value.split(':');
  if (type === 'category') return { type: 'category', id };
  if (type === 'brand') return { type: 'brand', id: Number(id) };
  return { type: 'section', section: id as Extract<CollectionLink, { type: 'section' }>['section'] };
}

export default function StorefrontAppearancePage() {
  const { store } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.storefrontCustomization(), queryFn: getStorefrontCustomization });
  const categoriesQuery = useQuery({ queryKey: queryKeys.storeCategories(), queryFn: listStoreCategories });
  // Cada "Restaurar padrão" remonta o formulário da seção, para o rascunho voltar ao padrão.
  const [versions, setVersions] = useState<Record<StorefrontSection, number>>({
    announcement: 0,
    banners: 0,
    hero: 0,
    benefits: 0,
    flash: 0,
    collections: 0,
  });

  const data = query.data;

  async function save<K extends StorefrontSection>(section: K, value: StorefrontConfig[K]) {
    const changes: StorefrontConfigChanges = { [section]: value };
    const updated = await updateStorefrontCustomization(changes);
    queryClient.setQueryData<StorefrontCustomization>(queryKeys.storefrontCustomization(), updated);
  }

  async function reset(section: StorefrontSection) {
    const changes: StorefrontConfigChanges = { [section]: null };
    const updated = await updateStorefrontCustomization(changes);
    queryClient.setQueryData<StorefrontCustomization>(queryKeys.storefrontCustomization(), updated);
    setVersions((current) => ({ ...current, [section]: current[section] + 1 }));
  }

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="Aparência da vitrine"
        subtitle="Banners e textos da página da sua loja"
        backHref="/loja"
      />

      {store && (
        <a
          href={storeUrl(store.handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
        >
          <Icon name="externalLink" size={14} />
          Ver minha vitrine
        </a>
      )}

      {query.isPending && <div className="h-64 animate-pulse rounded-2xl bg-ink-50" />}

      {query.isError && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3">
          <p role="alert" className="text-xs font-medium text-danger">
            {getErrorMessage(query.error)}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {data && (
        <div className="flex max-w-3xl flex-col gap-4">
          <p className="rounded-xl bg-primary-50 px-4 py-3 text-xs leading-relaxed text-primary-700">
            Sua vitrine já vem pronta com banners e textos padrão. Altere só o que quiser: cada bloco é salvo
            separado e dá para voltar ao padrão a qualquer momento. Os produtos, categorias e ofertas aparecem
            sozinhos a partir do seu estoque.
          </p>

          <AnnouncementForm
            key={`announcement-${versions.announcement}`}
            saved={data.config.announcement}
            customized={data.customized.announcement}
            onSave={(value) => save('announcement', value)}
            onReset={() => reset('announcement')}
          />
          <BannersForm
            key={`banners-${versions.banners}`}
            saved={data.config.banners}
            customized={data.customized.banners}
            categories={categoriesQuery.data?.items ?? []}
            onSave={(value) => save('banners', value)}
            onReset={() => reset('banners')}
          />
          <BenefitsForm
            key={`benefits-${versions.benefits}`}
            saved={data.config.benefits}
            customized={data.customized.benefits}
            onSave={(value) => save('benefits', value)}
            onReset={() => reset('benefits')}
          />
          <FlashForm
            key={`flash-${versions.flash}`}
            saved={data.config.flash}
            customized={data.customized.flash}
            onSave={(value) => save('flash', value)}
            onReset={() => reset('flash')}
          />
          <CollectionsForm
            key={`collections-${versions.collections}`}
            saved={data.config.collections}
            customized={data.customized.collections}
            categories={categoriesQuery.data?.items ?? []}
            onSave={(value) => save('collections', value)}
            onReset={() => reset('collections')}
          />
        </div>
      )}
    </div>
  );
}

type FormProps<K extends StorefrontSection> = {
  saved: StorefrontConfig[K];
  customized: boolean;
  onSave: (value: StorefrontConfig[K]) => Promise<void>;
  onReset: () => Promise<void>;
};

function AnnouncementForm({ saved, customized, onSave, onReset }: FormProps<'announcement'>) {
  const [draft, setDraft] = useState(saved);
  return (
    <SectionEditor
      title="Barra de aviso"
      description="A faixa escura no topo da vitrine."
      customized={customized}
      draft={draft}
      saved={saved}
      isValid={!draft.enabled || filled(draft.text)}
      onSave={onSave}
      onReset={onReset}
    >
      <ToggleRow title="Mostrar a barra" checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
      <Field label="Texto" hint={`Até ${LIMITS.announcementText} caracteres.`}>
        <TextInput
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          maxLength={LIMITS.announcementText}
          disabled={!draft.enabled}
          aria-label="Texto da barra de aviso"
        />
      </Field>
      <Field label="Texto do canto direito (opcional)" hint="Vazio: a vitrine mostra as formas de pagamento que você aceita.">
        <TextInput
          value={draft.rightText ?? ''}
          onChange={(value) => setDraft({ ...draft, rightText: value.trim() ? value : null })}
          maxLength={LIMITS.announcementRight}
          disabled={!draft.enabled}
          placeholder="Ex.: Entrega grátis em compras acima de R$ 150"
          aria-label="Texto do canto direito"
        />
      </Field>
    </SectionEditor>
  );
}

function BannersForm({
  saved,
  customized,
  categories,
  onSave,
  onReset,
}: FormProps<'banners'> & { categories: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState(saved);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const setItem = (index: number, patch: Partial<StorefrontBanner>) =>
    setDraft(draft.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  }

  async function addBanner(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois.
    event.target.value = '';
    if (!file) return;
    setAddError(null);
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setAddError(`Imagem muito grande (máx. ${MAX_IMAGE_MB} MB).`);
      return;
    }
    setAdding(true);
    try {
      const { url } = await uploadBannerImage(file);
      setDraft((current) => [...current, { imageUrl: url, link: null }]);
    } catch (error) {
      setAddError(getErrorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  return (
    <SectionEditor
      title="Banners do topo"
      description="As imagens que passam no topo da vitrine, de um lado para o outro. Até 5."
      customized={customized}
      draft={draft}
      saved={saved}
      isValid={draft.length >= 1 && draft.length <= MAX_BANNERS}
      onSave={onSave}
      onReset={onReset}
    >
      {draft.map((item, index) => {
        const value = item.link ? linkToValue(item.link) : NO_LINK;
        const known =
          value === NO_LINK ||
          SECTION_LINKS.some((option) => option.value === value) ||
          categories.some((category) => `category:${category.id}` === value);
        const options = [
          { value: NO_LINK, label: 'Nenhum (só a imagem)' },
          ...SECTION_LINKS,
          ...categories.map((category) => ({ value: `category:${category.id}`, label: `Categoria: ${category.name}` })),
          // Link configurado por outro caminho (marca ou categoria que não existe mais): mantém visível.
          ...(known ? [] : [{ value, label: 'Link atual' }]),
        ];
        return (
          <div key={index} className="flex flex-col gap-3 rounded-xl border border-ink-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink-500">Banner {index + 1}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Subir o banner ${index + 1}`}
                  className="h-8 rounded-lg border border-ink-200 px-2.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === draft.length - 1}
                  aria-label={`Descer o banner ${index + 1}`}
                  className="h-8 rounded-lg border border-ink-200 px-2.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(draft.filter((_, itemIndex) => itemIndex !== index))}
                  disabled={draft.length <= 1}
                  aria-label={`Remover o banner ${index + 1}`}
                  className="h-8 rounded-lg px-2.5 text-xs font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-40"
                >
                  Remover
                </button>
              </div>
            </div>
            <ImageField
              label={`Imagem do banner ${index + 1}`}
              hint="JPEG, PNG ou WEBP de até 5 MB. Tamanho ideal: 1920 × 600 (formato bem largo)."
              value={item.imageUrl}
              onChange={(imageUrl) => imageUrl && setItem(index, { imageUrl })}
              removable={false}
            />
            <ImageField
              label={`Imagem do banner ${index + 1} no celular (opcional)`}
              hint="Versão vertical para o celular, formato 9:16 (ex.: 1080 × 1920). Sem ela, o celular usa a imagem larga."
              value={item.mobileImageUrl ?? null}
              onChange={(mobileImageUrl) => setItem(index, { mobileImageUrl })}
              emptyLabel="Usa a imagem larga"
              removeLabel="Usar a imagem larga"
            />
            <Field label="Ao clicar, leva para" hint={index === 0 && categories.length === 0 ? 'Crie categorias em "Meus produtos" para poder apontar para elas.' : undefined}>
              <SelectInput
                label={`Destino do banner ${index + 1}`}
                value={value}
                onChange={(next) => setItem(index, { link: next === NO_LINK ? null : valueToLink(next) })}
                options={options}
              />
            </Field>
          </div>
        );
      })}

      <div>
        <input ref={addInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={addBanner} className="sr-only" aria-label="Adicionar banner" />
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          disabled={adding || draft.length >= MAX_BANNERS}
          className="h-10 rounded-xl border border-dashed border-ink-300 px-4 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
        >
          {adding ? 'Enviando...' : draft.length >= MAX_BANNERS ? `Limite de ${MAX_BANNERS} banners` : '+ Adicionar banner'}
        </button>
        {addError && (
          <p className="mt-1.5 text-xs text-danger" role="alert">
            {addError}
          </p>
        )}
      </div>
    </SectionEditor>
  );
}

function BenefitsForm({ saved, customized, onSave, onReset }: FormProps<'benefits'>) {
  const [draft, setDraft] = useState(saved);
  const setItem = (index: number, patch: Partial<StorefrontConfig['benefits'][number]>) =>
    setDraft(draft.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));

  return (
    <SectionEditor
      title="Vantagens"
      description="A faixa com 4 diferenciais da sua loja, logo abaixo do banner."
      customized={customized}
      draft={draft}
      saved={saved}
      isValid={draft.every((item) => filled(item.title) && filled(item.text))}
      onSave={onSave}
      onReset={onReset}
    >
      {draft.map((item, index) => (
        <div key={index} className="grid gap-3 rounded-xl border border-ink-100 p-3 sm:grid-cols-[9rem_1fr_1.4fr]">
          <Field label={`Ícone ${index + 1}`}>
            <SelectInput
              label={`Ícone da vantagem ${index + 1}`}
              value={item.icon}
              onChange={(icon) => setItem(index, { icon: icon as BenefitIcon })}
              options={BENEFIT_ICONS.map((icon) => ({ value: icon, label: ICON_LABELS[icon] }))}
            />
          </Field>
          <Field label="Título">
            <TextInput value={item.title} onChange={(title) => setItem(index, { title })} maxLength={LIMITS.benefitTitle} aria-label={`Título da vantagem ${index + 1}`} />
          </Field>
          <Field label="Texto">
            <TextInput value={item.text} onChange={(text) => setItem(index, { text })} maxLength={LIMITS.benefitText} aria-label={`Texto da vantagem ${index + 1}`} />
          </Field>
        </div>
      ))}
    </SectionEditor>
  );
}

function FlashForm({ saved, customized, onSave, onReset }: FormProps<'flash'>) {
  const [draft, setDraft] = useState(saved);
  const set = (patch: Partial<StorefrontConfig['flash']>) => setDraft({ ...draft, ...patch });

  return (
    <SectionEditor
      title="Ofertas relâmpago"
      description="O banner escuro com contagem regressiva. Só aparece quando você tem produtos em promoção."
      customized={customized}
      draft={draft}
      saved={saved}
      isValid={filled(draft.title) && filled(draft.subtitle)}
      onSave={onSave}
      onReset={onReset}
    >
      <ToggleRow title="Mostrar o banner" description="Os produtos em promoção continuam aparecendo na lista de ofertas." checked={draft.enabled} onChange={(enabled) => set({ enabled })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título">
          <TextInput value={draft.title} onChange={(title) => set({ title })} maxLength={LIMITS.flashTitle} disabled={!draft.enabled} aria-label="Título das ofertas" />
        </Field>
        <Field label="Descrição">
          <TextInput value={draft.subtitle} onChange={(subtitle) => set({ subtitle })} maxLength={LIMITS.flashSubtitle} disabled={!draft.enabled} aria-label="Descrição das ofertas" />
        </Field>
      </div>
      <ImageField
        label="Imagem do banner"
        hint="Opcional. Sem imagem, a vitrine usa as fotos dos produtos em promoção."
        value={draft.imageUrl}
        onChange={(imageUrl) => set({ imageUrl })}
        disabled={!draft.enabled}
      />
    </SectionEditor>
  );
}

function CollectionsForm({
  saved,
  customized,
  categories,
  onSave,
  onReset,
}: FormProps<'collections'> & { categories: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState(saved);
  const setItem = (index: number, patch: Partial<StorefrontConfig['collections'][number]>) =>
    setDraft(draft.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));

  return (
    <SectionEditor
      title="Coleções em destaque"
      description="Dois banners lado a lado. Cada um leva a uma parte da loja."
      customized={customized}
      draft={draft}
      saved={saved}
      isValid={draft.every((item) => filled(item.title) && filled(item.subtitle) && filled(item.ctaLabel))}
      onSave={onSave}
      onReset={onReset}
    >
      {draft.map((item, index) => {
        const value = linkToValue(item.link);
        const known = SECTION_LINKS.some((option) => option.value === value) || categories.some((category) => `category:${category.id}` === value);
        const options = [
          ...SECTION_LINKS,
          ...categories.map((category) => ({ value: `category:${category.id}`, label: `Categoria: ${category.name}` })),
          // Link configurado por outro caminho (marca ou categoria que não existe mais): mantém visível.
          ...(known ? [] : [{ value, label: 'Link atual' }]),
        ];
        return (
          <div key={index} className="flex flex-col gap-3 rounded-xl border border-ink-100 p-3">
            <p className="text-xs font-semibold text-ink-500">Coleção {index + 1}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título">
                <TextInput value={item.title} onChange={(title) => setItem(index, { title })} maxLength={LIMITS.collectionTitle} aria-label={`Título da coleção ${index + 1}`} />
              </Field>
              <Field label="Texto do botão">
                <TextInput value={item.ctaLabel} onChange={(ctaLabel) => setItem(index, { ctaLabel })} maxLength={LIMITS.button} aria-label={`Botão da coleção ${index + 1}`} />
              </Field>
            </div>
            <Field label="Descrição">
              <TextInput value={item.subtitle} onChange={(subtitle) => setItem(index, { subtitle })} maxLength={LIMITS.collectionSubtitle} aria-label={`Descrição da coleção ${index + 1}`} />
            </Field>
            <Field label="O botão leva para" hint={categories.length === 0 ? 'Crie categorias em "Meus produtos" para poder apontar para elas.' : undefined}>
              <SelectInput
                label={`Destino da coleção ${index + 1}`}
                value={value}
                onChange={(next) => setItem(index, { link: valueToLink(next) })}
                options={options}
              />
            </Field>
            <ImageField
              label="Imagem"
              hint="Opcional. Sem imagem, a vitrine usa as fotos dos produtos dessa coleção."
              value={item.imageUrl}
              onChange={(imageUrl) => setItem(index, { imageUrl })}
            />
          </div>
        );
      })}
    </SectionEditor>
  );
}
