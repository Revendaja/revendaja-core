import Link from 'next/link';
import { AuroraBackground } from './AuroraBackground';

export function AuthShell({
  children,
  backHref,
  // true enquanto a ação já teve sucesso mas a troca para a próxima tela ainda não aconteceu
  // (ex.: logou, esperando o layout pai navegar). Cobre o card com um overlay em vez de deixar o
  // formulário "parado" sem feedback — dá a sensação de resposta imediata.
  transitioning = false,
}: {
  children: React.ReactNode;
  backHref?: string;
  transitioning?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <AuroraBackground />

      <div className="relative z-10 w-full max-w-md">
        {backHref && (
          <div className="mb-4 flex justify-end">
            <Link href={backHref} className="text-sm font-semibold text-ink-500 hover:text-ink-700">
              ← Voltar
            </Link>
          </div>
        )}

        <div className="relative overflow-hidden rounded-xl2 bg-white/95 p-7 shadow-xl shadow-primary-900/5 ring-1 ring-ink-100 backdrop-blur-sm">
          <div className="mb-6 flex justify-center">
            <Link href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Revendaja" className="h-14 w-14 object-contain" />
            </Link>
          </div>

          {children}

          {transitioning && (
            <div className="animate-fade-up absolute inset-0 z-20 flex items-center justify-center bg-white/90 backdrop-blur-sm">
              <span className="h-8 w-8 animate-spin rounded-full border-3 border-ink-200 border-t-primary-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500 text-white">
      {children}
    </div>
  );
}
