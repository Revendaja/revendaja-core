import { prisma } from '../../database/prisma';

export interface AccountBillingInfo {
  stripeSubscriptionId: string | null;
}

// Acesso a dados da exclusão de conta. Tudo que pertence à usuária some junto com a linha de
// `users` (onDelete: Cascade em loja, produtos, vendas, categorias, IA, notificações, sessões...).
export const accountRepository = {
  async getBillingInfo(userId: string): Promise<AccountBillingInfo | null> {
    const store = await prisma.store.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true },
    });
    return store ? { stripeSubscriptionId: store.stripeSubscriptionId } : null;
  },

  // URLs de imagem que a loja pode ter enviado: logo, imagem de produto manual, cópia nos itens de
  // venda e qualquer texto da personalização da vitrine. O filtro do que é nosso (bucket) fica em
  // `deleteUploadedImages`.
  async collectImageUrls(userId: string): Promise<string[]> {
    const store = await prisma.store.findUnique({
      where: { userId },
      select: {
        id: true,
        logo: true,
        storefrontConfig: true,
        storeProducts: { select: { image: true } },
      },
    });
    if (!store) return [];

    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { storeId: store.id }, productImageSm: { not: null } },
      select: { productImageSm: true },
      distinct: ['productImageSm'],
    });

    const urls = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value === 'string' && value.startsWith('http')) urls.add(value);
    };
    add(store.logo);
    store.storeProducts.forEach((product) => add(product.image));
    saleItems.forEach((item) => add(item.productImageSm));
    collectStrings(store.storefrontConfig, add);
    return [...urls];
  },

  // `StoreProductComponent.component` é onDelete: Restrict, que o Postgres confere na hora e pode
  // barrar o cascade da loja inteira; por isso os vínculos de kit saem primeiro, na mesma transação.
  async deleteUser(userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.storeProductComponent.deleteMany({
        where: { kit: { store: { userId } } },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  },
};

function collectStrings(value: unknown, visit: (text: string) => void): void {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, visit));
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, visit));
  }
}

export type AccountRepository = typeof accountRepository;
