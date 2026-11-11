import Link from 'next/link';

export function FinalCta({ appHref = null }: { appHref?: string | null }) {
  return (
    <section className="bg-black px-6 pb-20 md:pb-28">
      <div className="reveal relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-ink-900 px-6 py-16 text-center text-white sm:px-12 md:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-full h-[26rem] w-[44rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/30 blur-[120px]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center">
          <h2 className="text-balance text-3xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
            Organize sua revenda hoje mesmo
          </h2>
          <p className="mt-5 text-white/65 sm:text-lg">
            Crie sua conta grátis em poucos minutos e comece a vender com mais controle.
          </p>
          <Link
            href={appHref ?? '/register'}
            className="mt-9 rounded-full bg-primary-500 px-8 py-3.5 text-sm font-bold transition-all hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0"
          >
            {appHref ? 'Ir para o painel' : 'Criar conta grátis'}
          </Link>
        </div>
      </div>
    </section>
  );
}
