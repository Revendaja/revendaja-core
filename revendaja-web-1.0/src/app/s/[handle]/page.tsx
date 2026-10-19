import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStorefront, getStorefrontHome, STOREFRONT_PAGE_SIZE } from '@/lib/api/public';
import { isApiError } from '@/lib/api/errors';
import type { Storefront as StorefrontData, StorefrontHome } from '@/lib/api/types';
import { StorefrontView } from './StorefrontView';

// Vitrine pública de uma loja. Chega aqui por vianastore.localhost:3001 / vianastore.revendaja.com
// (o proxy reescreve o subdomínio para /s/[handle]) ou direto por /s/[handle].
// Sempre dinâmica: preço e estoque mudam o tempo todo.
export const dynamic = 'force-dynamic';

type Load = { kind: 'ok'; data: StorefrontData; home: StorefrontHome } | { kind: 'offline' } | { kind: 'not_found' };

async function load(handle: string): Promise<Load> {
  try {
    // Produtos (lista paginada) e página inicial (banners, atalhos, destaques) em paralelo.
    const [data, home] = await Promise.all([
      getStorefront(handle, { pageSize: STOREFRONT_PAGE_SIZE }),
      getStorefrontHome(handle),
    ]);
    return { kind: 'ok', data, home };
  } catch (error) {
    if (isApiError(error) && error.code === 'STORE_OFFLINE') return { kind: 'offline' };
    if (isApiError(error) && error.status === 404) return { kind: 'not_found' };
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps<'/s/[handle]'>): Promise<Metadata> {
  const { handle } = await params;
  const result = await load(handle.toLowerCase());
  if (result.kind !== 'ok') return { title: 'Loja não encontrada' };
  const { storeName, bio } = result.data.store;
  return {
    title: `${storeName} · Vitrine`,
    description: bio ?? `Veja os produtos de ${storeName} e faça seu pedido.`,
  };
}

export default async function StorefrontPage({ params }: PageProps<'/s/[handle]'>) {
  const { handle } = await params;
  const result = await load(handle.toLowerCase());

  if (result.kind === 'not_found') notFound();
  if (result.kind === 'offline') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold text-ink-900">Loja temporariamente indisponível</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500">Esta loja está fora do ar no momento. Volte em instantes.</p>
      </main>
    );
  }

  return <StorefrontView initial={result.data} home={result.home} />;
}
