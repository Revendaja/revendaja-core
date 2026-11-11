import Image from 'next/image';
import Link from 'next/link';
import hand from '@/../public/hand-app.webp';
import { LandingIcon, type LandingIconName } from './icons';

const FEATURES: { icon: LandingIconName; title: string; text: string }[] = [
  {
    icon: 'chart',
    title: 'Faturamento à vista',
    text: 'Veja quanto entrou no mês e acompanhe o que já foi recebido, sem planilha.',
  },
  {
    icon: 'target',
    title: 'Meta de vendas',
    text: 'Defina sua meta, acompanhe o progresso e saiba quanto falta para bater.',
  },
  {
    icon: 'bell',
    title: 'Alertas de estoque',
    text: 'O app avisa quando um produto estiver acabando, antes de você perder venda.',
  },
];

// Raios de luz em volta da mão. Duas camadas com as mesmas coordenadas: uma atrás da mão e outra por
// cima (só uma faixa fina cruzando o braço), para a luz parecer envolver a mão e não só ficar no fundo.
const BACK_RAYS = [
  { d: 'M -20 760 C 260 920 560 760 1020 190', w: 3, o: 1 },
  { d: 'M -20 610 C 300 790 650 640 1020 340', w: 2, o: 0.8 },
  { d: 'M 60 1020 C 340 830 700 700 1020 570', w: 2.5, o: 0.7 },
  { d: 'M 540 -20 C 600 300 770 520 1020 650', w: 2, o: 0.6 },
  { d: 'M 130 120 C 20 400 150 700 430 970', w: 2, o: 0.5 },
];
const FRONT_RAYS = [{ d: 'M 110 900 C 420 985 760 890 1020 650', w: 3, o: 1 }];

function Rays({ rays, id }: { rays: typeof BACK_RAYS; id: string }) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      aria-hidden
      className="pointer-events-none absolute -inset-[18%] h-[136%] w-[136%] overflow-visible"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ff6b00" stopOpacity="0" />
          <stop offset="0.45" stopColor="#ffa65e" />
          <stop offset="1" stopColor="#ff6b00" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {rays.map((ray) => (
        <g key={ray.d} opacity={ray.o}>
          <path d={ray.d} fill="none" stroke={`url(#${id}-g)`} strokeWidth={ray.w * 6} filter={`url(#${id}-b)`} opacity="0.7" />
          <path d={ray.d} fill="none" stroke={`url(#${id}-g)`} strokeWidth={ray.w} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

export function AppShowcase() {
  return (
    <section id="funcionalidades" className="relative isolate flex min-h-screen flex-col overflow-hidden bg-black text-white">
      {/* Brilho laranja de fundo, atrás da mão. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[40%] -z-10 h-[42rem] w-[42rem] max-w-none -translate-x-1/2 rounded-full bg-primary-500/20 blur-[150px] lg:left-[72%]"
      />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end gap-10 px-6 pb-8 pt-20 lg:pt-24">
        <div className="relative flex flex-col gap-8">
          <div className="reveal flex max-w-xl flex-col gap-6 lg:relative lg:z-10 lg:pb-4">
            <h2 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Sua revenda inteira<br className="hidden sm:block" /> na palma da mão
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-white/75 sm:text-base">
              Vendas, estoque e metas organizados no celular, para você gastar menos tempo anotando e mais
              tempo vendendo.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0"
              >
                Começar agora
              </Link>
              <a
                href="#planos"
                className="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold backdrop-blur transition-colors hover:bg-white/20"
              >
                Ver planos
              </a>
            </div>
          </div>

          {/* No desktop a mão ocupa o lado direito como o fundo do hero; no celular vem abaixo do texto.
              O braço se dissolve no fundo, sem corte seco. */}
          <div className="reveal relative mx-auto w-full max-w-sm sm:max-w-md lg:absolute lg:-top-24 lg:bottom-auto lg:left-auto lg:right-[-2rem] lg:mx-0 lg:w-[34rem] lg:max-w-none xl:right-0 xl:w-[40rem]">
            <Rays rays={BACK_RAYS} id="rb" />
            <Image
              src={hand}
              alt="Mão segurando um celular com o app Revendaja"
              sizes="(min-width: 1280px) 640px, (min-width: 1024px) 544px, 90vw"
              className="hand-fade relative h-auto w-full"
            />
            <Rays rays={FRONT_RAYS} id="rf" />
          </div>
        </div>

        <ul className="relative z-10 grid border-t border-white/15 pt-6 md:grid-cols-3 md:divide-x md:divide-white/15">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="reveal py-3 md:px-8 md:py-0 md:first:pl-0 md:last:pr-0">
              <p className="flex items-center gap-2.5 font-semibold">
                <LandingIcon name={feature.icon} className="h-5 w-5 text-primary-400" />
                {feature.title}
              </p>
              <p className="mt-1 text-sm leading-snug text-white/60">{feature.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
