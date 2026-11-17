import { SafeImage } from './SafeImage';

// Tela de carregamento da vitrine: cobre a página até o navegador terminar de ler o que está salvo
// neste aparelho (carrinho, favoritos) e de abrir o produto de um link. Sem ela, o contador de
// favoritos, o carrinho e o produto vão aparecendo aos poucos depois do primeiro desenho.
// Vem no HTML do servidor, então já está na tela antes de o JavaScript chegar.
export function StorefrontSplash({ storeName, logo }: { storeName: string; logo: string | null }) {
  return (
    <div
      id="storefront-splash"
      role="status"
      aria-live="polite"
      aria-label="Carregando a loja"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-white"
    >
      {/* Sem JavaScript a tela nunca sairia: nesse caso ela não cobre a página. */}
      <noscript>
        <style>{'#storefront-splash{display:none}'}</style>
      </noscript>
      {logo && (
        <SafeImage src={logo} alt={storeName} loading="eager" className="h-14 w-auto max-w-48 object-contain" fallback={null} />
      )}
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary-100 border-t-primary-500" aria-hidden />
      <span className="sr-only">Carregando {storeName}</span>
    </div>
  );
}
