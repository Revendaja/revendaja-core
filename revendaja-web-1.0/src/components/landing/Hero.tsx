import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#vitrine', label: 'Vitrine' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'FAQ' },
];

const HIGHLIGHTS = [
  { title: 'Vendas e cobranças', text: 'Saiba o que vendeu, para quem e quem ainda não pagou.' },
  { title: 'Estoque em dia', text: 'Aviso quando perfume, creme ou batom estiver acabando.' },
  { title: 'Catálogo no WhatsApp', text: 'Sua vitrine online pronta para mandar para as clientes.' },
];

// appHref: destino do app para quem já está logado (null para visitantes).
export function Hero({ appHref = null }: { appHref?: string | null }) {
  return (
    <section className="relative isolate flex min-h-screen flex-col overflow-hidden bg-black text-white">
      <div className="absolute inset-y-0 -right-[4%] left-0 -z-20 lg:left-[14%] lg:[mask-image:linear-gradient(to_right,transparent,black_25%)]">
        <Image src="/bg.png" alt="" fill priority sizes="100vw" className="hero-bg object-cover object-[68%_center]" />
      </div>
      {/* Escurece a esquerda e a base para dar contraste ao texto sem esconder a modelo. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/40 to-transparent lg:via-black/20" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/20 to-black/30" />

      <header className="hero-down mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" aria-label="Revendaja">
          <Image src="/logo-branco.png" alt="Revendaja" width={150} height={50} priority />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-white/80 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {appHref ? (
            <Link
              href={appHref}
              className="rounded-full bg-primary-500 px-5 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0"
            >
              Ir para o painel
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold text-white/90 hover:text-white">
                Entrar
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-primary-500 px-5 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0"
              >
                Começar agora
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end gap-10 px-6 pb-8 pt-24">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h1 style={{ '--delay': '0.3s' } as CSSProperties} className="hero-in max-w-xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Mais vendas, menos<br className="hidden sm:block" /> bagunça na sua revenda
          </h1>

          <div style={{ '--delay': '0.5s' } as CSSProperties} className="hero-in flex max-w-sm flex-col gap-5">
            <p className="text-sm leading-relaxed text-white/75 sm:text-base">
              Revende Natura, O Boticário, Avon ou outras marcas? Controle pedidos, estoque e pagamentos
              num só app e envie seu catálogo para as clientes pelo WhatsApp.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={appHref ?? '/register'}
                className="rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0"
              >
                {appHref ? 'Ir para o painel' : 'Começar agora'}
              </Link>
              <a
                href="#funcionalidades"
                className="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold backdrop-blur transition-colors hover:bg-white/20"
              >
                Saiba mais
              </a>
            </div>
          </div>
        </div>

        <ul className="grid border-t border-white/15 pt-6 md:grid-cols-3 md:divide-x md:divide-white/15">
          {HIGHLIGHTS.map((item, index) => (
            <li
              key={item.title}
              style={{ '--delay': `${0.75 + index * 0.12}s` } as CSSProperties}
              className="hero-in py-3 md:px-8 md:py-0 md:first:pl-0 md:last:pr-0">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm leading-snug text-white/60">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
