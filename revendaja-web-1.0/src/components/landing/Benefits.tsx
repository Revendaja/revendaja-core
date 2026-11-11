import { SectionHeading } from './SectionHeading';
import { LandingIcon, type LandingIconName } from './icons';

const BENEFITS: { icon: LandingIconName; title: string; text: string; note?: string }[] = [
  {
    icon: 'catalog',
    title: 'Catálogo pronto das marcas',
    text: 'Natura, O Boticário, Avon e outras já estão cadastradas. Menos digitação, mais tempo para vender.',
  },
  {
    icon: 'mic',
    title: 'Assistente que te ajuda',
    text: 'Tire dúvidas e peça ajuda por texto ou por voz, sem precisar aprender nenhum menu.',
  },
  {
    icon: 'tag',
    title: 'Ofertas e categorias',
    text: 'Organize os produtos por tipo e coloque preço promocional para destacar o que você quer vender.',
    note: 'A partir do plano Inicial',
  },
  {
    icon: 'gift',
    title: 'Cestas e kits',
    text: 'Junte produtos num presente com preço especial, ótimo para datas como Dia das Mães.',
    note: 'A partir do plano Inicial',
  },
  {
    icon: 'chart',
    title: 'Relatórios fáceis de entender',
    text: 'Veja o que mais vende e o que está parado há tempo, para decidir o que comprar de novo.',
    note: 'A partir do plano Inicial',
  },
  {
    icon: 'phone',
    title: 'No celular ou no computador',
    text: 'Use pelo app ou pelo site. Seus dados ficam guardados e protegidos, e você acessa de onde estiver.',
  },
];

export function Benefits() {
  return (
    <section id="beneficios" className="bg-white px-6 py-20 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHeading
            align="left"
            eyebrow="Vantagens"
            title="Tudo o que ajuda a sua revenda a crescer"
            text="Pensado para quem revende sozinha, sem equipe e sem tempo sobrando."
          />
        </div>

        <ul className="divide-y divide-ink-100 border-y border-ink-100">
          {BENEFITS.map((item) => (
            <li key={item.title} className="reveal flex gap-5 py-6 sm:py-7">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <LandingIcon name={item.icon} />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-600">{item.text}</p>
                {item.note && (
                  <p className="mt-2 text-xs font-medium text-ink-500">{item.note}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
