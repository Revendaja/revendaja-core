import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { storeHandleFromHost } from '@/lib/storefront/domain';

// vianastore.localhost:3001 (dev) ou vianastore.revendaja.com (produção) mostram a vitrine da loja
// "vianastore": a página fica em /s/[handle], e esta reescrita só leva o subdomínio até lá (a URL
// que o cliente vê não muda). Qualquer outro host segue para o app normal.
export function proxy(request: NextRequest) {
  const handle = storeHandleFromHost(request.headers.get('host'));
  if (!handle) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const target = `/s/${handle}${pathname === '/' ? '' : pathname}${search}`;
  return NextResponse.rewrite(new URL(target, request.url));
}

export const config = {
  // Fora: arquivos internos do Next e qualquer arquivo com extensão (ícone, imagens, etc.).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\..*).*)'],
};
