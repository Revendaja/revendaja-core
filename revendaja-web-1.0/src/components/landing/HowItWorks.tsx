import { SectionHeading } from './SectionHeading';

const STEPS = [
  {
    title: 'Crie sua conta',
    text: 'Cadastro rápido e sem cartão. Você escolhe as marcas que revende e já pode começar.',
  },
  {
    title: 'Adicione seus produtos',
    text: 'Escolha no catálogo das marcas: nome, foto e descrição já vêm prontos. Você só coloca o preço.',
  },
  {
    title: 'Venda e acompanhe',
    text: 'Mande o link da sua vitrine no WhatsApp, registre as vendas e veja quem já pagou.',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-cream px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Como funciona"
          title="Comece a usar em poucos minutos"
          text="Sem treinamento e sem complicação. Se você usa WhatsApp, vai usar o Revendaja."
        />

        <ol className="mt-14 grid gap-10 md:mt-20 md:grid-cols-3 md:gap-8 lg:gap-14">
          {STEPS.map((step, index) => (
            <li key={step.title} className="reveal relative flex gap-5 md:block">
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-900 text-lg font-bold text-white md:h-14 md:w-14 md:text-xl"
              >
                {index + 1}
              </span>
              {/* Linha ligando os passos (só no desktop). */}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[3.75rem] right-[-1.5rem] top-7 hidden h-px bg-ink-200 md:block lg:left-[4.5rem] lg:right-[-3.5rem]"
                />
              )}
              <div className="md:mt-6">
                <h3 className="text-xl font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-600">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
