import Image from 'next/image';
import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/legal';

const PRODUCT_LINKS = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#vitrine', label: 'Vitrine' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'Dúvidas' },
];

const LEGAL_LINKS = [
  { href: '/privacidade', label: 'Política de privacidade' },
  { href: '/excluir-conta', label: 'Excluir minha conta' },
];

const linkClass = 'text-sm text-white/60 transition-colors hover:text-white';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black px-6 py-14 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" aria-label="Revendaja">
            <Image src="/logo-branco.png" alt="Revendaja" width={140} height={47} />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
            Vendas, estoque e vitrine online para quem revende cosméticos.
          </p>
        </div>

        <nav aria-label="Produto">
          <p className="text-sm font-semibold">Produto</p>
          <ul className="mt-4 flex flex-col gap-3">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={linkClass}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <p className="text-sm font-semibold">Legal</p>
          <ul className="mt-4 flex flex-col gap-3">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-semibold">Contato</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className={`${linkClass} mt-4 inline-block break-all`}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      <p className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-6 text-xs text-white/40">
        © {new Date().getFullYear()} Revendaja. Todos os direitos reservados.
      </p>
    </footer>
  );
}
