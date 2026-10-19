'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { getStorefrontCustomization, updateStorefrontCustomization, type StorefrontConfigChanges } from '@/lib/api/storefrontConfig';
import { listStoreCategories } from '@/lib/api/storeCategories';
import { getErrorMessage } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queryKeys';
import { BENEFIT_ICONS, type BenefitIcon, type CollectionLink, type StorefrontConfig, type StorefrontCustomization, type StorefrontSection } from '@/lib/api/types';
import { storeUrl } from '@/lib/storefront/domain';
import { Field, PageHeader, TextInput, ToggleRow } from '@/components/products/FormParts';
import { Icon } from '@/components/dashboard/icons';
import { ImageField, SelectInput } from '@/components/storefront/editor/fields';
import { SectionEditor, filled } from '@/components/storefront/editor/SectionEditor';

// Limites iguais aos da API (storefront.config.ts).
const LIMITS = {
  announcementText: 120,
  announcementRight: 80,
  badge: 40,
  title: 60,
  subtitle: 160,
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
          <HeroForm
            key={`hero-${versions.hero}`}
            saved={data.config.hero}
            customized={data.customized.hero}
            onSave={(value) => save('hero', value)}
            onReset={() => reset('hero')}
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

function HeroForm({ saved, customized, onSave, onReset }: FormProps<'hero'>) {
  const [draft, setDraft] = useState(saved);
  const set = (patch: Partial<StorefrontConfig['hero']>) => setDraft({ ...draft, ...patch });
  const valid =
    filled(draft.badge) && filled(draft.title) && filled(draft.highlight) && filled(draft.subtitle) && filled(draft.primaryLabel) && filled(draft.secondaryLabel);

  return (
    <SectionEditor
      title="Banner principal"
      description="O destaque grande no topo da página."
      customized={customized}
      draft={draft}
      saved={saved}
      isValid={valid}
      onSave={onSave}
      onReset={onReset}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Selo (texto pequeno)">
          <TextInput value={draft.badge} onChange={(badge) => set({ badge })} maxLength={LIMITS.badge} aria-label="Selo do banner" />
        </Field>
        <div />
        <Field label="Título">
          <TextInput value={draft.title} onChange={(title) => set({ title })} maxLength={LIMITS.title} aria-label="Título do banner" />
        </Field>
        <Field label="Destaque (em laranja)">
          <TextInput value={draft.highlight} onChange={(highlight) => set({ highlight })} maxLength={LIMITS.title} aria-label="Destaque do banner" />
        </Field>
      </div>
      <Field label="Descrição" hint={`Até ${LIMITS.subtitle} caracteres.`}>
        <TextInput value={draft.subtitle} onChange={(subtitle) => set({ subtitle })} maxLength={LIMITS.subtitle} aria-label="Descrição do banner" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Botão principal">
          <TextInput value={draft.primaryLabel} onChange={(primaryLabel) => set({ primaryLabel })} maxLength={LIMITS.button} aria-label="Botão principal" />
        </Field>
        <Field label="Botão de ofertas" hint="Aparece só quando há produtos em promoção.">
          <TextInput value={draft.secondaryLabel} onChange={(secondaryLabel) => set({ secondaryLabel })} maxLength={LIMITS.button} aria-label="Botão de ofertas" />
        </Field>
      </div>
      <ImageField
        label="Imagem do banner"
        hint="Opcional. JPEG, PNG ou WEBP de até 5 MB (sugestão: 1200 × 800). Sem imagem, a vitrine monta a arte com as fotos dos seus produtos."
        value={draft.imageUrl}
        onChange={(imageUrl) => set({ imageUrl })}
      />
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
