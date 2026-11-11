import Link from 'next/link';
import { SectionHeading } from './SectionHeading';
import { LandingIcon } from './icons';

const POINTS = [
  'Seu endereço próprio, como sualoja.revendaja.com',
  'As clientes veem fotos e preços e pedem direto pelo WhatsApp',
  'Elas não precisam baixar nada nem criar conta',
];

// Produtos de exemplo, só para ilustrar a vitrine.
const SAMPLE = [
  { name: 'Hidratante corporal', price: 'R$ 39,90', tone: 'from-primary-200 to-primary-400' },
  { name: 'Perfume floral', price: 'R$ 129,90', tone: 'from-ink-200 to-ink-400' },
  { name: 'Batom matte', price: 'R$ 24,90', tone: 'from-danger-soft to-danger' },
  { name: 'Kit presente', price: 'R$ 89,90', tone: 'from-primary-100 to-primary-300' },
];

function PhoneMock() {
  return (
    <div
      role="img"
      aria-label="Exemplo de vitrine online com produtos e preços"
      className="mx-auto w-full max-w-[19rem] rounded-[2.5rem] border border-white/15 bg-ink-900 p-2.5 shadow-[0_30px_80px_-20px_rgba(255,107,0,0.35)] sm:max-w-[21rem]"
    >
      <div className="overflow-hidden rounded-[2rem] bg-white">
        <div className="flex items-center justify-center bg-ink-50 px-4 py-2.5">
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-ink-500 shadow-sm">
            sualoja.revendaja.com
          </span>
        </div>

        <div className="px-4 pb-5 pt-4">
          <p className="text-base font-bold text-ink-900">Studio da Ana</p>
          <p className="text-xs text-ink-500">Cosméticos e perfumaria</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {SAMPLE.map((item) => (
              <div key={item.name} className="rounded-xl border border-ink-100 p-2">
                <div className={`aspect-square rounded-lg bg-gradient-to-br ${item.tone}`} />
                <p className="mt-2 text-xs font-semibold leading-tight text-ink-900">{item.name}</p>
                <p className="mt-0.5 text-xs font-bold text-primary-600">{item.price}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-full bg-success py-2.5 text-center text-xs font-bold text-white">
            Pedir pelo WhatsApp
          </div>
        </div>
      </div>
    </div>
  );
}

export function StorefrontPreview() {
  return (
    <section id="vitrine" className="relative overflow-hidden bg-black px-6 py-20 text-white md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 translate-x-1/3 rounded-full bg-primary-500/15 blur-[140px]"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHeading
            align="left"
            tone="dark"
            eyebrow="Vitrine online"
            title="Uma loja só sua, pronta para mandar no WhatsApp"
            text="Chega de mandar foto por foto. Você manda um link e a cliente escolhe com calma."
          />

          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map((point) => (
              <li key={point} className="reveal flex items-start gap-3 text-white/80">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-primary-400">
                  <LandingIcon name="check" className="h-3.5 w-3.5" />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <Link
            href="/register"
            className="mt-10 inline-flex rounded-full bg-primary-500 px-6 py-3 text-sm font-bold transition-all hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0"
          >
            Criar minha vitrine
          </Link>
        </div>

        <div className="reveal">
          <PhoneMock />
        </div>
      </div>
    </section>
  );
}
