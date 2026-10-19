import { z } from 'zod';
import { env } from '../../config/env';

// Personalização da vitrine pública. A loja começa com tudo no PADRÃO (gerado aqui, a partir do nome
// da loja) e só o que ela altera é gravado (`Store.storefrontConfig`). Cada seção é independente:
// restaurar uma seção é apagar o override dela, e o padrão volta.

// --- Limites de texto (também usados pelo painel) --------------------------------------------------

const text = (max: number) => z.string().trim().min(1).max(max);

// Imagens vêm do nosso próprio upload (S3): aceitar qualquer URL deixaria a loja pôr rastreador ou
// conteúdo de terceiros na vitrine. Sem S3 configurado (dev) vale qualquer URL https.
const imageUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((value) => value.startsWith('https://') || value.startsWith('http://localhost'), {
    message: 'A imagem precisa ser um link seguro (https).',
  })
  .refine((value) => !env.S3_PUBLIC_BASE_URL || value.startsWith(env.S3_PUBLIC_BASE_URL), {
    message: 'Use uma imagem enviada pelo painel.',
  });

export const BENEFIT_ICONS = ['truck', 'card', 'shield', 'chat', 'gift', 'star'] as const;
export const COLLECTION_SECTIONS = ['featured', 'offers', 'new', 'catalog'] as const;

// --- Seções --------------------------------------------------------------------------------------

const announcementSchema = z.object({
  enabled: z.boolean(),
  text: text(120),
  // Texto do canto direito da barra. Vazio = a vitrine mostra as formas de pagamento aceitas.
  rightText: text(80).nullable(),
});

const heroSchema = z.object({
  badge: text(40),
  title: text(60),
  // Palavra(s) em destaque, na cor da loja, logo abaixo do título.
  highlight: text(60),
  subtitle: text(160),
  primaryLabel: text(24),
  secondaryLabel: text(24),
  // null = arte padrão (montada com as fotos dos produtos da loja).
  imageUrl: imageUrl.nullable(),
});

const benefitSchema = z.object({
  icon: z.enum(BENEFIT_ICONS),
  title: text(30),
  text: text(60),
});

const flashSchema = z.object({
  enabled: z.boolean(),
  title: text(40),
  subtitle: text(80),
  imageUrl: imageUrl.nullable(),
});

const collectionLinkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('section'), section: z.enum(COLLECTION_SECTIONS) }),
  z.object({ type: z.literal('category'), id: z.string().uuid() }),
  z.object({ type: z.literal('brand'), id: z.coerce.number().int().positive() }),
]);

const collectionSchema = z.object({
  title: text(40),
  subtitle: text(80),
  ctaLabel: text(24),
  imageUrl: imageUrl.nullable(),
  link: collectionLinkSchema,
});

export const storefrontConfigSchema = z.object({
  announcement: announcementSchema,
  hero: heroSchema,
  benefits: z.array(benefitSchema).length(4),
  flash: flashSchema,
  collections: z.array(collectionSchema).length(2),
});

// O que está gravado: cada seção opcional (ausente = padrão).
export const storefrontOverridesSchema = storefrontConfigSchema.partial();

// O que o painel envia: seção preenchida = grava; `null` = restaurar o padrão; ausente = não mexe.
export const updateStorefrontConfigSchema = z
  .object({
    announcement: announcementSchema.nullable(),
    hero: heroSchema.nullable(),
    benefits: z.array(benefitSchema).length(4).nullable(),
    flash: flashSchema.nullable(),
    collections: z.array(collectionSchema).length(2).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Envie pelo menos uma seção.' });

export type StorefrontConfig = z.infer<typeof storefrontConfigSchema>;
export type StorefrontOverrides = z.infer<typeof storefrontOverridesSchema>;
export type UpdateStorefrontConfigInput = z.infer<typeof updateStorefrontConfigSchema>;
export type StorefrontSection = keyof StorefrontConfig;

export const STOREFRONT_SECTIONS: readonly StorefrontSection[] = [
  'announcement',
  'hero',
  'benefits',
  'flash',
  'collections',
];

// --- Padrões -------------------------------------------------------------------------------------

export function buildDefaultConfig(storeName: string): StorefrontConfig {
  return {
    announcement: {
      enabled: true,
      text: `Bem-vinda à ${storeName}! Escolha seus produtos e faça o pedido pelo site.`,
      rightText: null,
    },
    hero: {
      badge: 'NOVIDADES DA LOJA',
      title: 'Beleza e cuidado',
      highlight: 'para o seu dia a dia',
      subtitle: `Escolha seus favoritos na loja de ${storeName} e faça o pedido em poucos cliques.`,
      primaryLabel: 'Ver produtos',
      secondaryLabel: 'Ver ofertas',
      imageUrl: null,
    },
    benefits: [
      { icon: 'truck', title: 'Retirada ou entrega', text: 'Você escolhe como receber' },
      { icon: 'card', title: 'Pagamento facilitado', text: 'Pix, cartão ou dinheiro' },
      { icon: 'shield', title: 'Pedido seguro', text: 'Confirmado direto pela loja' },
      { icon: 'chat', title: 'Atendimento próximo', text: 'Fale com a sua consultora' },
    ],
    flash: {
      enabled: true,
      title: 'Ofertas relâmpago',
      subtitle: 'Preços especiais por tempo limitado',
      imageUrl: null,
    },
    collections: [
      {
        title: 'Mais vendidos',
        subtitle: 'Os favoritos dos nossos clientes',
        ctaLabel: 'Ver coleção',
        imageUrl: null,
        link: { type: 'section', section: 'featured' },
      },
      {
        title: 'Novidades',
        subtitle: 'Acabou de chegar na loja',
        ctaLabel: 'Ver novidades',
        imageUrl: null,
        link: { type: 'section', section: 'new' },
      },
    ],
  };
}

// Padrão + o que a loja alterou. Um override inválido (dado antigo, formato mudou) é ignorado, não
// derruba a vitrine: a seção cai no padrão.
export function resolveConfig(storeName: string, stored: unknown): StorefrontConfig {
  const defaults = buildDefaultConfig(storeName);
  const overrides = parseOverrides(stored);
  return { ...defaults, ...overrides };
}

export function parseOverrides(stored: unknown): StorefrontOverrides {
  if (stored === null || typeof stored !== 'object') return {};
  const result: Record<string, unknown> = {};
  for (const section of STOREFRONT_SECTIONS) {
    const value = (stored as Record<string, unknown>)[section];
    if (value === undefined || value === null) continue;
    const parsed = storefrontConfigSchema.shape[section].safeParse(value);
    if (parsed.success) result[section] = parsed.data;
  }
  return result as StorefrontOverrides;
}

// Aplica a mudança do painel sobre o que já estava gravado. `null` apaga o override (volta ao padrão).
export function applyConfigUpdate(
  current: StorefrontOverrides,
  update: UpdateStorefrontConfigInput,
): StorefrontOverrides {
  const next: Record<string, unknown> = { ...current };
  for (const section of STOREFRONT_SECTIONS) {
    if (!(section in update)) continue;
    const value = update[section];
    if (value === null) delete next[section];
    else next[section] = value;
  }
  return next as StorefrontOverrides;
}

// Quais seções a loja personalizou (o painel mostra "Padrão" ou "Personalizado" e libera "Restaurar").
export function customizedSections(
  overrides: StorefrontOverrides,
): Record<StorefrontSection, boolean> {
  return Object.fromEntries(
    STOREFRONT_SECTIONS.map((section) => [section, overrides[section] !== undefined]),
  ) as Record<StorefrontSection, boolean>;
}
