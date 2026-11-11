import Link from 'next/link';
import { PLANS } from '@/lib/data/plans';
import { SectionHeading } from './SectionHeading';
import { LandingIcon } from './icons';

export function Plans() {
  return (
    <section id="planos" className="bg-cream px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Planos"
          title="Comece de graça e cresça quando fizer sentido"
          text="Você só paga se precisar de mais. E pode trocar de plano a qualquer momento dentro do app."
        />

        <div className="mt-14 grid items-stretch gap-5 md:mt-16 lg:grid-cols-3 lg:gap-6">
          {PLANS.map((plan) => {
            const dark = !!plan.highlight;
            const free = plan.id === 'free';
            return (
              <article
                key={plan.id}
                className={`reveal relative flex flex-col rounded-3xl p-7 sm:p-8 ${
                  dark ? 'bg-ink-900 text-white' : 'border border-ink-100 bg-white text-ink-900'
                }`}
              >
                {dark && (
                  <span className="absolute right-6 top-6 rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-white">
                    Mais completo
                  </span>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className={`mt-1 min-h-10 text-sm ${dark ? 'text-white/65' : 'text-ink-500'}`}>{plan.tagline}</p>

                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">{plan.priceLabel}</span>
                  {plan.billingLabel && (
                    <span className={`text-sm ${dark ? 'text-white/60' : 'text-ink-500'}`}>{plan.billingLabel}</span>
                  )}
                </p>

                <ul className="mt-7 flex flex-1 flex-col gap-3.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm leading-snug">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          dark ? 'bg-primary-500/25 text-primary-300' : 'bg-primary-50 text-primary-600'
                        }`}
                      >
                        <LandingIcon name="check" className="h-3 w-3" />
                      </span>
                      <span className={dark ? 'text-white/85' : 'text-ink-700'}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`mt-8 flex h-12 items-center justify-center rounded-full text-sm font-bold transition-all hover:-translate-y-0.5 active:translate-y-0 ${
                    dark
                      ? 'bg-primary-500 text-white hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30'
                      : 'border border-ink-200 text-ink-900 hover:border-ink-900'
                  }`}
                >
                  {free ? 'Criar conta grátis' : `Começar com o ${plan.name}`}
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
