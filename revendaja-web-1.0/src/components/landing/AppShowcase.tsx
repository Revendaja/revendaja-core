import Image from 'next/image';
import Link from 'next/link';
import hand from "@/../public/hand-cutout.png";

const FEATURES = [
  {
    title: 'Faturamento à vista',
    text: 'Veja quanto entrou no mês e acompanhe o que já foi recebido, sem planilha.',
  },
  {
    title: 'Meta de vendas',
    text: 'Defina sua meta, acompanhe o progresso e saiba quanto falta para bater.',
  },
  {
    title: 'Alertas de estoque',
    text: 'O app avisa quando um produto estiver acabando, antes de você perder venda.',
  },
];

export function AppShowcase() {
  return (
    <section id="funcionalidades" className="relative overflow-hidden bg-black px-6 pb-24 text-white md:pb-32">
      {/* Brilho laranja de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[45%] -z-0 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary-500/20 blur-[140px] lg:left-[68%]"
      />

      <div className="reveal relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70">
          Feito para revendedoras de cosméticos
        </span>
        <h2 className="mt-6 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          Sua revenda inteira na palma da mão
        </h2>
        <p className="mt-5 max-w-xl text-white/65 sm:text-lg">
          Vendas, estoque e metas organizados no celular, para você gastar menos tempo anotando e mais
          tempo vendendo.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="rounded-full bg-primary-500 px-6 py-3 text-sm font-bold transition-all hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30 active:translate-y-0"
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

      <div className="relative mx-auto mt-16 grid max-w-7xl items-center gap-12 md:mt-24 lg:grid-cols-2">
        <ul className="flex flex-col gap-10 lg:max-w-md">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="reveal border-l-2 border-primary-500 pl-5">
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">{feature.text}</p>
            </li>
          ))}
        </ul>

        <div className="reveal relative mx-auto w-full max-w-md lg:max-w-lg">
          <Image
            src={hand}
            alt="Mão segurando um celular com o app Revendaja"
            width={1199}
            height={1312}
            sizes="(min-width: 1024px) 512px, 90vw"
            className="showcase-float relative h-auto w-full drop-shadow-[0_0_60px_rgba(255,107,0,0.35)]"
          />
        </div>
      </div>
    </section>
  );
}
