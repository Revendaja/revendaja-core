import type { StorefrontConfig, StorefrontHome, StorefrontProduct } from '@/lib/api/types';

export function product(id: string, overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    id,
    name: `Produto ${id}`,
    description: null,
    brand: 'Natura',
    image: `https://img.test/${id}.jpg`,
    imageSm: `https://img.test/${id}-sm.jpg`,
    price: 100,
    promoPrice: null,
    isPromoActive: false,
    inStock: true,
    isNew: false,
    ...overrides,
  };
}

export function onSale(id: string, price: number, promoPrice: number): StorefrontProduct {
  return product(id, { price, promoPrice, isPromoActive: true });
}

// Mesmos textos padrão que a API devolve para uma loja chamada "Leal Perfumaria".
export const DEFAULT_CONFIG: StorefrontConfig = {
  announcement: {
    enabled: true,
    text: 'Bem-vinda à Leal Perfumaria! Escolha seus produtos e faça o pedido pelo site.',
    rightText: null,
  },
  hero: {
    badge: 'NOVIDADES DA LOJA',
    title: 'Beleza e cuidado',
    highlight: 'para o seu dia a dia',
    subtitle: 'Escolha seus favoritos na loja de Leal Perfumaria e faça o pedido em poucos cliques.',
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
  flash: { enabled: true, title: 'Ofertas relâmpago', subtitle: 'Preços especiais por tempo limitado', imageUrl: null },
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

export function many(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => product(`${prefix}${index}`));
}

// Página inicial de uma loja com bastante coisa: 8 destaques, 4 novidades, 2 ofertas e 2 atalhos.
export function homeData(overrides: Partial<StorefrontHome> = {}): StorefrontHome {
  return {
    store: {
      storeName: 'Leal Perfumaria',
      handle: 'lealperfumaria',
      bio: 'Cosméticos com entrega rápida.',
      acceptedPaymentMethods: ['pix', 'card', 'cash'],
      hideBranding: false,
    },
    config: DEFAULT_CONFIG,
    categories: [
      { type: 'brand', id: '1', name: 'Natura', count: 12, image: 'https://img.test/natura.jpg' },
      { type: 'category', id: 'cat-1', name: 'Presentes', count: 4, image: null },
    ],
    featured: many('f', 8),
    offers: {
      products: [onSale('o1', 100, 70), onSale('o2', 50, 45)],
      endsAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
    },
    newArrivals: many('n', 4),
    ...overrides,
  };
}

export function listPage(items = many('p', 3), total = items.length) {
  return {
    store: { storeName: 'Leal Perfumaria', handle: 'lealperfumaria', bio: null, acceptedPaymentMethods: ['pix' as const, 'card' as const, 'cash' as const] },
    products: { items, page: 1, pageSize: 24, total },
  };
}
