import Link from 'next/link';
import { SectionHeading } from './SectionHeading';
import { LandingIcon } from './icons';

const QUESTIONS = [
  {
    q: 'Preciso entender de tecnologia?',
    a: 'Não. O Revendaja foi feito para quem nunca usou um sistema. Se você sabe mandar mensagem no WhatsApp, consegue usar.',
  },
  {
    q: 'Tem custo para começar?',
    a: 'Não. O plano Gratuito não cobra nada e não pede cartão. Quando sua revenda crescer, você escolhe se quer um plano com mais recursos.',
  },
  {
    q: 'Minhas clientes precisam baixar o app?',
    a: 'Não. Elas abrem o link da sua vitrine no celular, escolhem os produtos e pedem pelo WhatsApp, sem criar conta.',
  },
  {
    q: 'Vendo mais de uma marca. Funciona?',
    a: 'Funciona. Você mistura produtos de várias marcas na mesma vitrine e no mesmo controle de estoque e vendas.',
  },
  {
    q: 'Posso mudar de plano depois?',
    a: 'Pode, dentro do próprio app e quando quiser. Você gerencia a assinatura na sua conta, sem precisar falar com ninguém.',
  },
  {
    q: 'Meus dados e os das minhas clientes estão seguros?',
    a: 'Tratamos tudo conforme a LGPD e você pode pedir a exclusão da conta quando quiser. Se quiser saber os detalhes, leia a nossa política de privacidade.',
    link: { href: '/privacidade', label: 'Ver política de privacidade' },
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-white px-6 py-20 md:py-28">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Dúvidas" title="Perguntas frequentes" />

        <div className="mt-12 divide-y divide-ink-100 border-y border-ink-100 md:mt-14">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-semibold text-ink-900 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 [&::-webkit-details-marker]:hidden sm:text-lg">
                {item.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-600 transition-transform duration-300 group-open:rotate-180">
                  <LandingIcon name="chevron" className="h-4 w-4" />
                </span>
              </summary>
              <div className="pb-6 pr-12 leading-relaxed text-ink-600">
                <p>{item.a}</p>
                {item.link && (
                  <Link href={item.link.href} className="mt-2 inline-block font-semibold text-primary-600 underline underline-offset-2 hover:text-primary-700">
                    {item.link.label}
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
