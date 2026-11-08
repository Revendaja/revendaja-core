import type { Metadata } from 'next';
import Link from 'next/link';
import { Section, List } from '@/components/legal/blocks';
import { CONTACT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Excluir conta e dados | RevendaJá',
  description: 'Como pedir a exclusão da sua conta do RevendaJá e dos dados associados a ela.',
};

const SUBJECT = 'Excluir conta RevendaJá';

export default function DeleteAccountPage() {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <Link href="/" className="text-sm font-semibold text-primary-600 hover:text-primary-700">
        ← Voltar para o RevendaJá
      </Link>

      <h1 className="mt-6 text-3xl font-extrabold text-ink-900 sm:text-4xl">
        Excluir conta e dados do RevendaJá
      </h1>
      <p className="mt-4 leading-7 text-ink-700">
        Esta página explica como pedir a exclusão da sua conta no aplicativo{' '}
        <strong>RevendaJá</strong> e dos dados associados a ela.
      </p>
      <p className="mt-3 text-sm leading-6 text-ink-500">
        English summary: to delete your RevendaJá account and its data, email{' '}
        <a className="font-semibold underline" href={mailto}>
          {CONTACT_EMAIL}
        </a>{' '}
        from the email address registered in the account, with the subject “{SUBJECT}”. We confirm
        your identity, answer within 15 days and complete the deletion within 30 days. You can also
        delete your account directly in the app: More → My Data (Meus Dados) → “Excluir minha
        conta”. Details below.
      </p>

      <Section title="Opção 1: excluir direto no aplicativo (mais rápido)">
        <List
          ordered
          items={[
            <>
              Abra o app <strong>RevendaJá</strong> e entre na sua conta.
            </>,
            <>
              Vá em <strong>Mais → Meus Dados</strong> e toque em{' '}
              <strong>“Excluir minha conta”</strong>.
            </>,
            <>
              Confirme com a sua senha (ou com a conta Google, se você entra pelo Google). A conta e
              os dados são apagados na hora.
            </>,
          ]}
        />
        <p>
          Se você tem uma assinatura ativa, ela é cancelada antes da exclusão, para você não ser
          cobrada depois.
        </p>
      </Section>

      <Section title="Opção 2: pedir a exclusão por e-mail (sem precisar do app)">
        <p>Use esta opção se você desinstalou o app ou não consegue entrar na conta.</p>
        <List
          ordered
          items={[
            <>
              Envie um e-mail para{' '}
              <a className="font-semibold text-primary-600 underline" href={mailto}>
                {CONTACT_EMAIL}
              </a>{' '}
              usando o <strong>mesmo e-mail cadastrado</strong> na sua conta do RevendaJá.
            </>,
            <>
              Use o assunto <strong>“{SUBJECT}”</strong> e informe o nome da sua loja (ou o
              endereço dela, como <em>minhaloja.revendaja.com</em>).
            </>,
            <>
              Podemos pedir uma confirmação de identidade para proteger você de pedidos feitos por
              outra pessoa.
            </>,
            <>
              Responderemos em até <strong>15 dias</strong> e concluiremos a exclusão em até{' '}
              <strong>30 dias</strong> após a confirmação.
            </>,
          ]}
        />
        <p>
          Se você usa o app e quer apenas apagar produtos ou vendas, pode fazer isso direto no
          aplicativo, sem excluir a conta.
        </p>
      </Section>

      <Section title="O que é excluído">
        <List
          items={[
            'Dados da conta: nome, e-mail, WhatsApp, senha (criptografada) e vínculo com o login do Google.',
            'Dados da loja: nome, endereço da vitrine, descrição, logo e personalização.',
            'Produtos, categorias, preços, estoque e as imagens que você enviou.',
            'Vendas registradas, com os nomes, WhatsApp e endereços de clientes que você informou.',
            'Pedidos feitos na vitrine da sua loja.',
            'Conversas e ações do assistente de IA.',
            'Identificadores de notificação dos seus aparelhos.',
          ]}
        />
      </Section>

      <Section title="O que pode ser mantido e por quanto tempo">
        <List
          items={[
            'Registros de cobrança de assinatura, mantidos pela Stripe e por nós para cumprir obrigações fiscais e legais, pelo prazo que a lei exigir.',
            'Cópias de segurança do banco de dados, que podem conter seus dados por até 30 dias até serem substituídas no ciclo normal de rotação.',
            'Registros de segurança e informações necessárias para cumprir a lei, atender autoridades ou nos defender em processos, apenas pelo tempo exigido.',
          ]}
        />
        <p>
          Depois desses prazos, os dados mantidos são apagados ou anonimizados. Mais detalhes sobre
          como tratamos os dados estão na nossa{' '}
          <Link className="font-semibold text-primary-600 underline" href="/privacidade">
            Política de Privacidade
          </Link>
          .
        </p>
      </Section>

      <div className="mt-10">
        <a
          href={mailto}
          className="inline-flex rounded-xl bg-primary-600 px-5 py-3 font-semibold text-white hover:bg-primary-700"
        >
          Pedir exclusão por e-mail
        </a>
      </div>
    </main>
  );
}
